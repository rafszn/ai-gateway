import { z } from "zod";

export const API_KEY_TIERS = ["2B", "1B", "600M", "300M"] as const;
export type ApiKeyTier = (typeof API_KEY_TIERS)[number];

const objectIdSchema = z.string().regex(/^[0-9a-f]{24}$/i);

const apiKeyNameSchema = z.string().trim().min(1).max(80);

const modelIdSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^gpt-[a-z0-9]+(?:[.-][a-z0-9]+)*-1$/,
    "Model must be a GPT deployment name ending in -1",
  );

const modelsSchema = z
  .array(modelIdSchema)
  .min(1)
  .max(100)
  .refine((models) => new Set(models).size === models.length, {
    message: "Models must be unique",
  });

const positiveTokenLimitSchema = z
  .number()
  .int()
  .min(1)
  .max(Number.MAX_SAFE_INTEGER);

const limitFields = {
  tokensPerMinute: positiveTokenLimitSchema,
  dailyTokens: positiveTokenLimitSchema,
  weeklyTokens: positiveTokenLimitSchema,
  monthlyTokens: positiveTokenLimitSchema,
};

export const apiKeyMemberParamsSchema = z
  .object({
    memberId: objectIdSchema,
  })
  .strict();

export const apiKeyParamsSchema = z
  .object({
    memberId: objectIdSchema,
    keyId: objectIdSchema,
  })
  .strict();

export const listApiKeysQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export const createApiKeySchema = z
  .object({
    models: modelsSchema,
    name: apiKeyNameSchema.optional(),
    tier: z.enum(API_KEY_TIERS).default("300M"),
    limits: z.object(limitFields).partial().strict().optional(),
  })
  .strict();

export const updateApiKeyNameSchema = z
  .object({
    name: apiKeyNameSchema,
  })
  .strict();

export const replaceApiKeyModelsSchema = z
  .object({
    models: modelsSchema,
  })
  .strict();

export const updateApiKeyLimitsSchema = z
  .object(limitFields)
  .partial()
  .strict()
  .refine((limits) => Object.keys(limits).length > 0, {
    message: "At least one limit must be provided",
  });

export type CreateApiKeyDTO = z.infer<typeof createApiKeySchema>;
export type UpdateApiKeyNameDTO = z.infer<typeof updateApiKeyNameSchema>;
export type ReplaceApiKeyModelsDTO = z.infer<typeof replaceApiKeyModelsSchema>;
export type UpdateApiKeyLimitsDTO = z.infer<typeof updateApiKeyLimitsSchema>;
export type ListApiKeysQueryDTO = z.infer<typeof listApiKeysQuerySchema>;
