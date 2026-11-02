import { z } from "zod";

const withDeploymentSuffix = (name: string) =>
  name.endsWith("-1") ? name : `${name}-1`;

export const responsesRequestSchema = z
  .object({
    stream: z.boolean().optional(),
    max_output_tokens: z.unknown().optional(),
    model: z.string().trim().min(1).max(200).transform(withDeploymentSuffix),
  })
  .loose();

export type ResponsesRequest = z.infer<typeof responsesRequestSchema>;
