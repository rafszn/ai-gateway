import logger from "../../config.js";
import { randomUUID } from "node:crypto";
import { sendOpenAiError } from "../library/openai-error.js";
import { HTTP_STATUS } from "../constants/http-status-codes.js";
import apiKeyService from "../../core/Modules/Apikeys/service.js";
import type { RequestHandler, Response as ExpressResponse } from "express";
import type { ApiKeyRecord } from "../../data/models/api-key/api-key.types.js";

export interface GatewayApiKeyContext {
  memberId: string;
  key: ApiKeyRecord;
  requestId: string;
  requestStartedAt: number;
}

function rejectApiKey(
  response: ExpressResponse,
  requestId: string,
  reason: string,
) {
  logger.warn("Responses API key authentication rejected", {
    requestId,
    reason,
  });

  return sendOpenAiError(response, HTTP_STATUS.UNAUTHORIZED, {
    message: "Invalid API key",
    type: "authentication_error",
    code: "invalid_api_key",
  });
}

export const authenticateApiKey: RequestHandler = async (
  request,
  response,
  next,
) => {
  const requestId = randomUUID();
  const requestStartedAt = Date.now();

  response.setHeader("x-gateway-request-id", requestId);

  const apiKeyHeader = request.get("api-key");
  const authorizationHeader = request.get("authorization");
  const bearerMatch = authorizationHeader?.match(/^Bearer\s+(\S+)$/i);

  if (
    apiKeyHeader &&
    authorizationHeader &&
    (!bearerMatch || bearerMatch[1] !== apiKeyHeader)
  ) {
    return rejectApiKey(response, requestId, "credential_headers_conflict");
  }

  const secret = apiKeyHeader || bearerMatch?.[1];

  if (!secret) {
    return rejectApiKey(response, requestId, "credential_missing");
  }

  try {
    const authenticated = await apiKeyService.authenticateSecret(secret);

    if (!authenticated) {
      return rejectApiKey(response, requestId, "invalid_or_inactive_key");
    }

    response.locals.gatewayApiKey = {
      ...authenticated,
      requestId,
      requestStartedAt,
    } satisfies GatewayApiKeyContext;

    logger.info("Responses API key authenticated", {
      requestId,
      memberId: authenticated.memberId,
      keyId: authenticated.key.id,
    });

    return next();
  } catch (error) {
    logger.error("Responses API key lookup failed", error, { requestId });
    return next(error);
  }
};
