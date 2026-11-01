import { z } from "zod";

export const publicUsageQuerySchema = z
  .object({
    keyName: z.string().trim().min(1).max(80),
  })
  .strict();

export type PublicUsageQueryDTO = z.infer<typeof publicUsageQuerySchema>;
