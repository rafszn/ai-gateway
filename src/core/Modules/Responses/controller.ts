import logger from "../../../config.js";
import responsesService from "./service.js";
import usageService from "../Usage/service.js";
import { pipeline } from "node:stream/promises";
import quotaService from "../Quotas/service.js";
import { Readable, Transform } from "node:stream";
import { responsesRequestSchema } from "./dto.js";
import { StringDecoder } from "node:string_decoder";
import type { TransformCallback } from "node:stream";
import cfg from "../../../global/environment.config.js";
import type { RequestHandler, Response as ExpressResponse } from "express";
import { sendOpenAiError } from "../../../global/library/openai-error.js";
import { HTTP_STATUS } from "../../../global/constants/http-status-codes.js";
import type { UsageStatus } from "../../../data/models/usage/usage.types.js";
import type { ApiKeyRecord } from "../../../data/models/api-key/api-key.types.js";
import type { GatewayApiKeyContext } from "../../../global/middlewares/authenticate-api-key.js";

interface ResponseUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getTokenCount(value: unknown): number | null {
  return Number.isSafeInteger(value) && typeof value === "number" && value >= 0
    ? value
    : null;
}

function extractUsage(value: unknown): ResponseUsage | null {
  if (!isRecord(value)) {
    return null;
  }

  const response = isRecord(value.response) ? value.response : value;
  const usage = isRecord(response.usage)
    ? response.usage
    : isRecord(value.usage)
      ? value.usage
      : null;

  if (!usage) {
    return null;
  }

  return {
    inputTokens: getTokenCount(usage.input_tokens),
    outputTokens: getTokenCount(usage.output_tokens),
    totalTokens: getTokenCount(usage.total_tokens),
  };
}

function getRequestedModel(value: unknown): string | null {
  if (!isRecord(value) || typeof value.model !== "string") {
    return null;
  }

  return value.model.slice(0, 200);
}

function toUsage(value: unknown): ResponseUsage | null {
  try {
    return extractUsage(JSON.parse(String(value)) as unknown);
  } catch {
    return null;
  }
}

class ResponsesUsageTransform extends Transform {
  private readonly decoder = new StringDecoder("utf8");
  private pending = "";
  private latestUsage: ResponseUsage | null = null;

  get usage(): ResponseUsage | null {
    return this.latestUsage;
  }

  private inspect(text: string): void {
    this.pending += text.replace(/\r\n/g, "\n");

    let boundary = this.pending.indexOf("\n\n");

    while (boundary >= 0) {
      const frame = this.pending.slice(0, boundary);
      this.pending = this.pending.slice(boundary + 2);
      this.inspectFrame(frame);
      boundary = this.pending.indexOf("\n\n");
    }

    if (this.pending.length > 1_000_000) {
      this.pending = this.pending.slice(-4_096);
    }
  }

  private inspectFrame(frame: string): void {
    const data = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n");

    if (!data || data === "[DONE]") {
      return;
    }

    try {
      const usage = extractUsage(JSON.parse(data) as unknown);

      if (usage) {
        this.latestUsage = usage;
      }
    } catch {
      // Ignore non JSON SSE frames. The original bytes still pass through.
    }
  }

  override _transform(
    chunk: Buffer,
    encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);
    this.inspect(this.decoder.write(bytes));
    callback(null, bytes);
  }

  override _flush(callback: TransformCallback): void {
    this.inspect(this.decoder.end());

    if (this.pending.length > 0) {
      this.inspectFrame(this.pending);
    }

    callback();
  }
}

function copyUpstreamHeaders(
  upstream: Response,
  downstream: ExpressResponse,
): void {
  for (const name of [
    "content-type",
    "retry-after",
    "x-request-id",
    "apim-request-id",
    "openai-processing-ms",
    "location",
  ]) {
    const value = upstream.headers.get(name);

    if (value) {
      downstream.setHeader(name, value);
    }
  }
}

function getAuthenticatedKey(
  response: ExpressResponse,
): GatewayApiKeyContext | null {
  const context = response.locals.gatewayApiKey as
    | (GatewayApiKeyContext & { key: ApiKeyRecord })
    | undefined;

  return context ?? null;
}

export const createResponse: RequestHandler = async (request, response) => {
  const auth = getAuthenticatedKey(response);

  if (!auth) {
    return sendOpenAiError(response, HTTP_STATUS.UNAUTHORIZED, {
      message: "Invalid API key",
      type: "authentication_error",
      code: "invalid_api_key",
    });
  }

  const startedAt = auth.requestStartedAt;
  let usageRecordId: string;

  try {
    const usageRecord = await usageService.start({
      memberId: auth.memberId,
      keyId: auth.key.id,
      model: getRequestedModel(request.body),
      requestedAt: new Date(startedAt),
    });

    usageRecordId = usageRecord.id;
  } catch (error) {
    logger.error("Could not start the request usage record", error);

    return sendOpenAiError(response, HTTP_STATUS.SERVICE_UNAVAILABLE, {
      message: "The gateway could not record this request",
      type: "server_error",
      code: "usage_record_unavailable",
    });
  }

  const abortController = new AbortController();
  let clientDisconnected = false;
  let upstreamAttempted = false;
  let upstreamStatus: number | null = null;
  let reservationId: string | null = null;
  let finished = false;

  const onRequestAborted = () => {
    clientDisconnected = true;
    abortController.abort();
  };

  const onResponseClose = () => {
    if (!response.writableEnded) {
      clientDisconnected = true;
      abortController.abort();
    }
  };

  request.once("aborted", onRequestAborted);
  response.once("close", onResponseClose);

  const finish = async (params: {
    status: Exclude<UsageStatus, "PENDING">;
    httpStatus: number | null;
    usage: ResponseUsage | null;
  }): Promise<void> => {
    if (finished) {
      return;
    }

    finished = true;
    const completedAt = new Date();
    const currentReservationId = reservationId;
    reservationId = null;

    if (currentReservationId) {
      try {
        if (!upstreamAttempted) {
          await quotaService.releaseBeforeUpstream(currentReservationId);
        } else if (params.usage?.totalTokens !== null && params.usage) {
          await quotaService.completeWithUsage({
            reservationId: currentReservationId,
            actualTokens: params.usage.totalTokens,
          });
        } else {
          await quotaService.completeWithoutUsage(currentReservationId);
        }
      } catch (error) {
        logger.error("Could not finalize the quota reservation", error);
      }
    }

    try {
      await usageService.finish({
        usageId: usageRecordId,
        quotaReservationId: currentReservationId,
        inputTokens: params.usage?.inputTokens ?? null,
        outputTokens: params.usage?.outputTokens ?? null,
        totalTokens: params.usage?.totalTokens ?? null,
        status: params.status,
        httpStatus: params.httpStatus,
        latencyMs: Math.max(0, completedAt.getTime() - startedAt),
        completedAt,
      });
    } catch (error) {
      logger.error("Could not finalize the request usage record", error);
    }
  };

  try {
    const parsedRequest = responsesRequestSchema.safeParse(request.body);

    if (!parsedRequest.success) {
      const issue = parsedRequest.error.issues[0];
      await finish({
        status: "REJECTED",
        httpStatus: HTTP_STATUS.BAD_REQUEST,
        usage: null,
      });

      return sendOpenAiError(response, HTTP_STATUS.BAD_REQUEST, {
        message: issue?.message ?? "Invalid Responses API request",
        type: "invalid_request_error",
        param: issue?.path.join(".") || "body",
        code: "invalid_request",
      });
    }

    const body = parsedRequest.data;

    if (!auth.key.models.includes(body.model)) {
      await finish({
        status: "REJECTED",
        httpStatus: HTTP_STATUS.BAD_REQUEST,
        usage: null,
      });

      return sendOpenAiError(response, HTTP_STATUS.BAD_REQUEST, {
        message: `Model not allowed: ${body.model}`,
        type: "invalid_request_error",
        param: "model",
        code: "model_not_allowed",
      });
    }

    const preparedRequest = responsesService.prepare(body);

    if (preparedRequest.estimatedTokens > cfg.FOUNDRY_MAX_REQUEST_TOKENS) {
      await finish({
        status: "REJECTED",
        httpStatus: HTTP_STATUS.PAYLOAD_TOO_LARGE,
        usage: null,
      });

      return sendOpenAiError(response, HTTP_STATUS.PAYLOAD_TOO_LARGE, {
        message: "Request exceeds the configured token limit",
        type: "invalid_request_error",
        param: "input",
        code: "request_too_large",
      });
    }

    const quota = await quotaService.reserve({
      keyId: auth.key.id,
      memberId: auth.memberId,
      limits: auth.key.limits,
      reservedTokens: preparedRequest.estimatedTokens,
    });

    if (quota.type === "LIMITED") {
      await finish({
        status: "REJECTED",
        httpStatus: HTTP_STATUS.TOO_MANY_REQUESTS,
        usage: null,
      });

      return sendOpenAiError(
        response,
        HTTP_STATUS.TOO_MANY_REQUESTS,
        {
          message: `Token quota exceeded: ${quota.blockedLimits.join(", ")}`,
          type: "rate_limit_error",
          code: "quota_exceeded",
          limits: quota.blockedLimits,
        },
        quota.retryAfterSeconds,
      );
    }

    if (quota.type === "REQUEST_TOO_LARGE") {
      await finish({
        status: "REJECTED",
        httpStatus: HTTP_STATUS.PAYLOAD_TOO_LARGE,
        usage: null,
      });

      return sendOpenAiError(response, HTTP_STATUS.PAYLOAD_TOO_LARGE, {
        message: "Request cannot fit within this key's configured limits",
        type: "invalid_request_error",
        param: "input",
        code: "request_too_large",
      });
    }

    reservationId = quota.reservation.id;

    if (abortController.signal.aborted || response.destroyed) {
      await finish({
        status: "INTERRUPTED",
        httpStatus: null,
        usage: null,
      });

      return;
    }

    upstreamAttempted = true;
    const upstream = await responsesService.send(
      preparedRequest,
      abortController.signal,
    );
    upstreamStatus = upstream.status;

    const contentType = upstream.headers.get("content-type") ?? "";

    if (
      upstream.body &&
      contentType.toLowerCase().includes("text/event-stream")
    ) {
      copyUpstreamHeaders(upstream, response);
      response.setHeader("Cache-Control", "no-cache, no-transform");
      response.setHeader("X-Accel-Buffering", "no");
      response.status(upstream.status);
      response.flushHeaders();

      const usageTransform = new ResponsesUsageTransform();

      await pipeline(
        Readable.fromWeb(
          upstream.body as import("node:stream/web").ReadableStream<Uint8Array>,
        ),
        usageTransform,
        response,
      );

      await finish({
        status:
          upstream.status >= 200 && upstream.status < 300
            ? "SUCCEEDED"
            : "FAILED",
        httpStatus: upstream.status,
        usage: usageTransform.usage,
      });

      return;
    }

    const responseBody = upstream.body
      ? Buffer.from(await upstream.arrayBuffer())
      : Buffer.alloc(0);

    const usage = toUsage(responseBody.toString("utf8"));

    copyUpstreamHeaders(upstream, response);
    response.status(upstream.status);

    await finish({
      status:
        upstream.status >= 200 && upstream.status < 300
          ? "SUCCEEDED"
          : "FAILED",
      httpStatus: upstream.status,
      usage,
    });

    return response.send(responseBody);
  } catch (error) {
    const status = clientDisconnected ? "INTERRUPTED" : "FAILED";
    const httpStatus =
      upstreamStatus ??
      (upstreamAttempted
        ? HTTP_STATUS.BAD_GATEWAY
        : HTTP_STATUS.SERVICE_UNAVAILABLE);

    await finish({
      status,
      httpStatus: clientDisconnected ? upstreamStatus : httpStatus,
      usage: null,
    });

    if (response.destroyed || clientDisconnected) {
      return;
    }

    if (response.headersSent) {
      response.destroy();
      return;
    }

    logger.error("Responses proxy request failed", error);

    return sendOpenAiError(
      response,
      upstreamAttempted
        ? HTTP_STATUS.BAD_GATEWAY
        : HTTP_STATUS.SERVICE_UNAVAILABLE,
      {
        message: upstreamAttempted
          ? "The upstream model request failed"
          : "The gateway could not prepare the model request",
        type: "server_error",
        code: upstreamAttempted ? "upstream_error" : "gateway_error",
      },
    );
  } finally {
    request.removeListener("aborted", onRequestAborted);
    response.removeListener("close", onResponseClose);
  }
};
