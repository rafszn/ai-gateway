import type { Response } from "express";

export interface OpenAiErrorBody {
  type: string;
  message: string;
  limits?: string[];
  code?: string | null;
  param?: string | null;
}

export function sendOpenAiError(
  response: Response,
  status: number,
  error: OpenAiErrorBody,
  retryAfterSeconds?: number,
): Response {
  if (retryAfterSeconds !== undefined) {
    response.setHeader("Retry-After", String(retryAfterSeconds));
  }

  return response.status(status).json({ error });
}
