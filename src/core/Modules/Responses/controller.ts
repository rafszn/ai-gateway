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

  const { requestId, requestStartedAt: startedAt } = auth;
  const requestModel = getRequestedModel(request.body);
  const streamRequested =
    isRecord(request.body) && request.body.stream === true;

  logger.info("Responses request started", {
    requestId,
    memberId: auth.memberId,
    keyId: auth.key.id,
    model: requestModel,
    stream: streamRequested,
  });

  let stage = "usage_record_start";
  let usageRecordId: string;

  try {
    const usageRecord = await usageService.start({
      memberId: auth.memberId,
      keyId: auth.key.id,
      model: requestModel,
      requestedAt: new Date(startedAt),
    });

    usageRecordId = usageRecord.id;

    logger.info("Responses usage record started", {
      requestId,
      usageId: usageRecordId,
    });
  } catch (error) {
    logger.error("Could not start the request usage record", error, {
      requestId,
      memberId: auth.memberId,
      keyId: auth.key.id,
    });

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
  let upstreamContentType: string | null = null;
  let providerRequestId: string | null = null;
  let reservationId: string | null = null;
  let reservedTokens: number | null = null;
  let parsedResponseUsage: ResponseUsage | null = null;
  let usageTransform: ResponsesUsageTransform | null = null;
  let quotaDisposition = "NOT_RESERVED";
  let usagePersisted = false;
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
    logger.info("FOUNDRY USAGE", { usage: params.usage });
    
    finished = true;
    const completedAt = new Date();
    const latencyMs = Math.max(0, completedAt.getTime() - startedAt);
    const currentReservationId = reservationId;
    reservationId = null;

    if (currentReservationId) {
      try {
        if (!upstreamAttempted) {
          const released =
            await quotaService.releaseBeforeUpstream(currentReservationId);
          quotaDisposition = released
            ? "RELEASED_BEFORE_UPSTREAM"
            : "RELEASE_NOT_APPLIED";
        } else if (params.usage && params.usage.totalTokens !== null) {
          const settled = await quotaService.completeWithUsage({
            reservationId: currentReservationId,
            actualTokens: params.usage.totalTokens,
          });
          quotaDisposition = settled
            ? "SETTLED_WITH_FOUNDRY_USAGE"
            : "USAGE_SETTLEMENT_NOT_APPLIED";
        } else {
          const charged =
            await quotaService.completeWithoutUsage(currentReservationId);
          quotaDisposition = charged
            ? "CHARGED_RESERVED_ESTIMATE"
            : "ESTIMATE_CHARGE_NOT_APPLIED";
        }

        logger.info("Responses quota finalized", {
          requestId,
          reservationId: currentReservationId,
          disposition: quotaDisposition,
          reservedTokens,
          actualTokens: params.usage?.totalTokens ?? null,
        });
      } catch (error) {
        quotaDisposition = "FINALIZATION_FAILED";
        logger.error("Could not finalize the quota reservation", error, {
          requestId,
          reservationId: currentReservationId,
          reservedTokens,
          actualTokens: params.usage?.totalTokens ?? null,
        });
      }
    }

    try {
      const finalizedUsage = await usageService.finish({
        usageId: usageRecordId,
        quotaReservationId: currentReservationId,
        inputTokens: params.usage?.inputTokens ?? null,
        outputTokens: params.usage?.outputTokens ?? null,
        totalTokens: params.usage?.totalTokens ?? null,
        status: params.status,
        httpStatus: params.httpStatus,
        latencyMs,
        completedAt,
      });

      usagePersisted = finalizedUsage !== null;

      if (!usagePersisted) {
        logger.warn("Responses usage record was not finalized", {
          requestId,
          usageId: usageRecordId,
        });
      }
    } catch (error) {
      logger.error("Could not finalize the request usage record", error, {
        requestId,
        usageId: usageRecordId,
      });
    }

    logger.info("Responses request completed", {
      requestId,
      usageId: usageRecordId,
      memberId: auth.memberId,
      keyId: auth.key.id,
      model: requestModel,
      status: params.status,
      httpStatus: params.httpStatus,
      upstreamAttempted,
      upstreamStatus,
      providerRequestId,
      upstreamContentType,
      quotaDisposition,
      reservedTokens,
      inputTokens: params.usage?.inputTokens ?? null,
      outputTokens: params.usage?.outputTokens ?? null,
      totalTokens: params.usage?.totalTokens ?? null,
      usagePersisted,
      latencyMs,
    });
  };

  try {
    stage = "request_validation";
    const parsedRequest = responsesRequestSchema.safeParse(request.body);

    if (!parsedRequest.success) {
      const issue = parsedRequest.error.issues[0];
      const param = issue?.path.join(".") || "body";

      logger.warn("Responses request rejected", {
        requestId,
        stage,
        reason: "invalid_request",
        param,
      });

      await finish({
        status: "REJECTED",
        httpStatus: HTTP_STATUS.BAD_REQUEST,
        usage: null,
      });

      return sendOpenAiError(response, HTTP_STATUS.BAD_REQUEST, {
        message: issue?.message ?? "Invalid Responses API request",
        type: "invalid_request_error",
        param,
        code: "invalid_request",
      });
    }

    const body = parsedRequest.data;
    const model = body.model;

    stage = "model_authorization";

    if (!auth.key.models.includes(model)) {
      logger.warn("Responses request rejected", {
        requestId,
        stage,
        reason: "model_not_allowed",
        model,
        keyId: auth.key.id,
      });

      await finish({
        status: "REJECTED",
        httpStatus: HTTP_STATUS.BAD_REQUEST,
        usage: null,
      });

      return sendOpenAiError(response, HTTP_STATUS.BAD_REQUEST, {
        message: `Model not allowed: ${model}`,
        type: "invalid_request_error",
        param: "model",
        code: "model_not_allowed",
      });
    }

    stage = "request_estimation";
    const preparedRequest = responsesService.prepare(body);
    const {
      estimatedInputTokens,
      reservedOutputTokens,
      outputReservationSource,
    } = preparedRequest;

    reservedTokens = preparedRequest.estimatedTokens;

    logger.info("Responses request token estimate", {
      requestId,
      model,
      estimatedInputTokens,
      reservedOutputTokens,
      outputReservationSource,
      maxRequestTokens: cfg.FOUNDRY_MAX_REQUEST_TOKENS,
      estimatedTotalTokens: preparedRequest.estimatedTokens,
      clientSentMaxOutputTokens: Object.hasOwn(body, "max_output_tokens"),
    });

    if (preparedRequest.estimatedTokens > cfg.FOUNDRY_MAX_REQUEST_TOKENS) {
      quotaDisposition = "REJECTED_REQUEST_SIZE";

      logger.warn("Responses request exceeds configured token limit", {
        requestId,
        estimatedInputTokens,
        reservedOutputTokens,
        estimatedTotalTokens: preparedRequest.estimatedTokens,
        maxRequestTokens: cfg.FOUNDRY_MAX_REQUEST_TOKENS,
      });

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

    stage = "quota_reservation";
    logger.info("Responses quota reservation requested", {
      requestId,
      keyId: auth.key.id,
      reservedTokens: preparedRequest.estimatedTokens,
      limits: auth.key.limits,
    });

    const quota = await quotaService.reserve({
      keyId: auth.key.id,
      memberId: auth.memberId,
      limits: auth.key.limits,
      reservedTokens: preparedRequest.estimatedTokens,
    });

    if (quota.type === "LIMITED") {
      quotaDisposition = "REJECTED_QUOTA_LIMIT";

      logger.warn("Responses quota reservation rejected", {
        requestId,
        keyId: auth.key.id,
        blockedLimits: quota.blockedLimits,
        retryAfterSeconds: quota.retryAfterSeconds,
        reservedTokens: preparedRequest.estimatedTokens,
      });

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
      quotaDisposition = "REJECTED_KEY_LIMIT";

      logger.warn("Responses request cannot fit key limits", {
        requestId,
        keyId: auth.key.id,
        reservedTokens: preparedRequest.estimatedTokens,
        limits: auth.key.limits,
      });

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
    quotaDisposition = "RESERVED";

    logger.info("Responses quota reserved", {
      requestId,
      reservationId,
      reservedTokens: preparedRequest.estimatedTokens,
    });

    if (abortController.signal.aborted || response.destroyed) {
      await finish({
        status: "INTERRUPTED",
        httpStatus: null,
        usage: null,
      });

      return;
    }

    stage = "foundry_request";
    logger.info("Foundry Responses request sending", {
      requestId,
      model,
      stream: preparedRequest.stream,
      reservedTokens,
      upstreamHost: preparedRequest.url.host,
      upstreamPath: preparedRequest.url.pathname,
    });

    upstreamAttempted = true;
    const upstream = await responsesService.send(
      preparedRequest,
      abortController.signal,
    );
    upstreamStatus = upstream.status;
    upstreamContentType = upstream.headers.get("content-type");
    providerRequestId =
      upstream.headers.get("x-request-id") ??
      upstream.headers.get("apim-request-id");

    logger.info("Foundry Responses response received", {
      requestId,
      providerRequestId,
      status: upstream.status,
      statusText: upstream.statusText,
      contentType: upstreamContentType,
      stream: preparedRequest.stream,
    });

    if (
      upstream.body &&
      (upstreamContentType ?? "").toLowerCase().includes("text/event-stream")
    ) {
      stage = "stream_response";
      copyUpstreamHeaders(upstream, response);
      response.setHeader("Cache-Control", "no-cache, no-transform");
      response.setHeader("X-Accel-Buffering", "no");
      response.status(upstream.status);
      response.flushHeaders();

      const streamUsageTransform = new ResponsesUsageTransform();
      usageTransform = streamUsageTransform;

      await pipeline(
        Readable.fromWeb(
          upstream.body as import("node:stream/web").ReadableStream<Uint8Array>,
        ),
        streamUsageTransform,
        response,
      );

      parsedResponseUsage = streamUsageTransform.usage;

      logger.info("Foundry Responses usage parsed", {
        requestId,
        source: "stream",
        usage: parsedResponseUsage,
      });

      await finish({
        status:
          upstream.status >= 200 && upstream.status < 300
            ? "SUCCEEDED"
            : "FAILED",
        httpStatus: upstream.status,
        usage: parsedResponseUsage,
      });

      return;
    }

    stage = "read_response";
    const responseBody = upstream.body
      ? Buffer.from(await upstream.arrayBuffer())
      : Buffer.alloc(0);

    parsedResponseUsage = toUsage(responseBody.toString("utf8"));

    logger.info("Foundry Responses usage parsed", {
      requestId,
      source: "response_body",
      usage: parsedResponseUsage,
    });

    copyUpstreamHeaders(upstream, response);
    response.status(upstream.status).send(responseBody);

    void finish({
      status:
        upstream.status >= 200 && upstream.status < 300
          ? "SUCCEEDED"
          : "FAILED",
      httpStatus: upstream.status,
      usage: parsedResponseUsage,
    }).catch((error) => {
      logger.error(
        "Responses finalization failed after sending the response",
        error,
        {
          requestId,
          usageId: usageRecordId,
        },
      );
    });

    return;
  } catch (error) {
    const failedStage = stage;
    const status = clientDisconnected ? "INTERRUPTED" : "FAILED";
    const httpStatus =
      upstreamStatus ??
      (upstreamAttempted
        ? HTTP_STATUS.BAD_GATEWAY
        : HTTP_STATUS.SERVICE_UNAVAILABLE);

    await finish({
      status,
      httpStatus: clientDisconnected ? upstreamStatus : httpStatus,
      usage: parsedResponseUsage ?? usageTransform?.usage ?? null,
    });

    if (response.destroyed || clientDisconnected) {
      logger.warn("Responses request ended after client disconnect", {
        requestId,
        failedStage,
        upstreamAttempted,
        upstreamStatus,
        providerRequestId,
      });

      return;
    }

    if (response.headersSent) {
      logger.error("Responses stream failed after headers were sent", error, {
        requestId,
        failedStage,
        upstreamStatus,
        providerRequestId,
      });
      response.destroy();
      return;
    }

    logger.error("Responses proxy request failed", error, {
      requestId,
      failedStage,
      upstreamAttempted,
      upstreamStatus,
      providerRequestId,
    });

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
