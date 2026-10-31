import type { RequestHandler } from "express";
import { sendOpenAiError } from "../library/openai-error.js";
import { HTTP_STATUS } from "../constants/http-status-codes.js";
import apiKeyService from "../../core/Modules/Apikeys/service.js";
import type { ApiKeyRecord } from "../../data/models/api-key/api-key.types.js";

export interface GatewayApiKeyContext {
  memberId: string;
  key: ApiKeyRecord;
  requestStartedAt: number;
}

export const authenticateApiKey: RequestHandler = async (
  request,
  response,
  next,
) => {
  const requestStartedAt = Date.now();
  const apiKeyHeader = request.get("api-key");
  const authorizationHeader = request.get("authorization");
  const bearerMatch = authorizationHeader?.match(/^Bearer\s+(\S+)$/i);

  if (
    apiKeyHeader &&
    authorizationHeader &&
    (!bearerMatch || bearerMatch[1] !== apiKeyHeader)
  ) {
    return sendOpenAiError(response, HTTP_STATUS.UNAUTHORIZED, {
      message: "Invalid API key",
      type: "authentication_error",
      code: "invalid_api_key",
    });
  }

  const secret = apiKeyHeader || bearerMatch?.[1];

  if (!secret) {
    return sendOpenAiError(response, HTTP_STATUS.UNAUTHORIZED, {
      message: "Invalid API key",
      type: "authentication_error",
      code: "invalid_api_key",
    });
  }

  try {
    const authenticated = await apiKeyService.authenticateSecret(secret);

    if (!authenticated) {
      return sendOpenAiError(response, HTTP_STATUS.UNAUTHORIZED, {
        message: "Invalid API key",
        type: "authentication_error",
        code: "invalid_api_key",
      });
    }

    response.locals.gatewayApiKey = {
      ...authenticated,
      requestStartedAt,
    } satisfies GatewayApiKeyContext;

    return next();
  } catch (error) {
    return next(error);
  }
};
