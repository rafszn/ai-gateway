import type { ResponsesRequest } from "./dto.js";
import { container, injectable } from "tsyringe";
import cfg from "../../../global/environment.config.js";

const BYTES_PER_TOKEN = 5.1;

type OutputReservationSource = "client" | "gateway_default";

export interface PreparedResponsesRequest {
  url: URL;
  stream: boolean;
  init: RequestInit;
  estimatedTokens: number;
  estimatedInputTokens: number;
  reservedOutputTokens: number;
  outputReservationSource: OutputReservationSource;
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

@injectable()
class ResponsesService {
  prepare(request: ResponsesRequest): PreparedResponsesRequest {
    const requestedOutputTokens = request.max_output_tokens;
    let reservedOutputTokens: number;
    let outputReservationSource: OutputReservationSource;

    if (
      typeof requestedOutputTokens === "number" &&
      Number.isSafeInteger(requestedOutputTokens) &&
      requestedOutputTokens >= 0
    ) {
      reservedOutputTokens = requestedOutputTokens;
      outputReservationSource = "client";
    } else {
      reservedOutputTokens = cfg.FOUNDRY_DEFAULT_OUTPUT_RESERVATION_TOKENS;
      outputReservationSource = "gateway_default";
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { max_output_tokens: _ignoredMaxOutputTokens, ...inputPayload } =
      request;

    const needsFullInputReservation =
      typeof request.previous_response_id === "string" ||
      containsNonTextInput(request.input);

    const estimatedInputTokens = needsFullInputReservation
      ? Math.max(0, cfg.FOUNDRY_MAX_REQUEST_TOKENS - reservedOutputTokens)
      : Math.ceil(
          Buffer.byteLength(JSON.stringify(inputPayload), "utf8") /
            BYTES_PER_TOKEN,
        );

    const estimatedTokens = estimatedInputTokens + reservedOutputTokens;

    const url = new URL(cfg.FOUNDRY_BASE_URL);
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/responses`;
    url.search = "";
    url.hash = "";

    return {
      url,
      stream: request.stream === true,
      estimatedInputTokens,
      reservedOutputTokens,
      outputReservationSource,
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
        body: JSON.stringify(request),
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

const responsesService = container.resolve(ResponsesService);
export default responsesService;
