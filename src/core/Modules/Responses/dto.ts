import { z } from "zod";
import cfg from "../../../global/environment.config.js";

export const responsesRequestSchema = z
  .object({
    model: z.string().trim().min(1).max(200),
    stream: z.boolean().optional(),
    max_output_tokens: z
      .number()
      .int()
      .min(16)
      .max(cfg.FOUNDRY_MAX_REQUEST_TOKENS)
      .nullable()
      .optional(),
  })
  .loose();

export type ResponsesRequest = z.infer<typeof responsesRequestSchema>;
