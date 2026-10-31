import type { ResponsesRequest } from "./dto.js";
import cfg from "../../../global/environment.config.js";

export interface PreparedResponsesRequest {
  url: URL;
  stream: boolean;
  init: RequestInit;
  estimatedTokens: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function containsNonTextInput(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsNonTextInput);
  }

  if (!isRecord(value)) {
    return false;
  }

  const nonTextTypes = new Set([
    "input_image",
    "input_audio",
    "input_file",
    "input_video",
  ]);

  if (typeof value.type === "string" && nonTextTypes.has(value.type)) {
    return true;
  }

  if ("image_url" in value || "file_id" in value) {
    return true;
  }

  return Object.values(value).some(containsNonTextInput);
}

class ResponsesService {
  prepare(request: ResponsesRequest): PreparedResponsesRequest {
    const maxOutputTokens =
      typeof request.max_output_tokens === "number"
        ? request.max_output_tokens
        : cfg.FOUNDRY_DEFAULT_MAX_OUTPUT_TOKENS;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { max_output_tokens: _ignoredMaxOutputTokens, ...inputPayload } =
      request;
    const needsFullInputReservation =
      typeof request.previous_response_id === "string" ||
      containsNonTextInput(request.input);

    const inputEstimate = needsFullInputReservation
      ? cfg.FOUNDRY_MAX_REQUEST_TOKENS - maxOutputTokens
      : Math.ceil(Buffer.byteLength(JSON.stringify(inputPayload), "utf8") / 2);

    const estimatedTokens = inputEstimate + maxOutputTokens;
    const forwardedBody = {
      ...request,
      max_output_tokens: maxOutputTokens,
    };

    const url = new URL(cfg.FOUNDRY_BASE_URL);
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/responses`;
    url.search = "";
    url.hash = "";

    return {
      url,
      stream: request.stream === true,
      estimatedTokens,
      init: {
        method: "POST",
        redirect: "manual",
        headers: {
          "content-type": "application/json",
          accept:
            request.stream === true
              ? "text/event-stream, application/json"
              : "application/json",
          "api-key": cfg.FOUNDRY_API_KEY,
        },
        body: JSON.stringify(forwardedBody),
      },
    };
  }

  send(
    request: PreparedResponsesRequest,
    signal: AbortSignal,
  ): Promise<Response> {
    return fetch(request.url, {
      ...request.init,
      signal,
    });
  }
}

const responsesService = new ResponsesService();
export default responsesService;
