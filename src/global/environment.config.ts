import { z } from "zod";
import dotenv from "dotenv";

const envFile = `.env.${process.env.NODE_ENV || "development"}`;
dotenv.config({ path: envFile });

const foundryBaseUrlSchema = z.url().refine((value) => {
  const url = new URL(value);

  return (
    url.protocol === "https:" &&
    url.search.length === 0 &&
    url.hash.length === 0 &&
    url.pathname.replace(/\/+$/, "").endsWith("/openai/v1")
  );
}, "FOUNDRY_BASE_URL must be an HTTPS Azure OpenAI v1 URL ending in /openai/v1");

const envSchema = z.object({
  APP_NAME: z.string().default("ai-gateway"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z
    .string()
    .transform((s) => parseInt(s, 10))
    .default(5000),

  /* ---------- mongo ---------- */
  MONGO_URL: z.string(),

  SUPER_ADMIN_USERNAME: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .regex(/^[a-zA-Z0-9._-]+$/)
    .transform((username) => username.toLowerCase()),
  SUPER_ADMIN_PASSWORD: z.string().min(12).max(128),
  ADMIN_JWT_SECRET: z.string().min(32),

  /* ---------- foundry openai ---------- */
  FOUNDRY_BASE_URL: foundryBaseUrlSchema,
  FOUNDRY_API_KEY: z.string().min(1),
  FOUNDRY_MAX_REQUEST_TOKENS: z.coerce
    .number()
    .int()
    .min(16)
    .max(1_200_000)
    .default(150_000),
  FOUNDRY_DEFAULT_OUTPUT_RESERVATION_TOKENS: z.coerce
    .number()
    .int()
    .min(16)
    .max(1_000_000)
    .default(16_384),

  /* ---------- resend ---------- */
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z.string().optional(),

  /* ---------- cloudinary ---------- */
  CLOUDINARY_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  /* ---------- cloudfare r2 ---------- */
  R2_ACCOUNT_ID: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_PUBLIC_BASE_URL: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),

  /* ---------- cache config ---------- */
  CACHE_DRIVER: z.enum(["redis", "memory"]).default("memory"),
  REDIS_URL: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Environment validation failed:", parsed.error.format());
  throw new Error("Invalid environment variables");
}

const env = parsed.data;

export const cfg = {
  NODE_ENV: env.NODE_ENV,
  PORT: Number(env.PORT),
  APP_NAME: env.APP_NAME,
  MONGO_URL: env.MONGO_URL,

  SUPER_ADMIN_USERNAME: env.SUPER_ADMIN_USERNAME,
  SUPER_ADMIN_PASSWORD: env.SUPER_ADMIN_PASSWORD,
  ADMIN_JWT_SECRET: env.ADMIN_JWT_SECRET,

  FOUNDRY_BASE_URL: env.FOUNDRY_BASE_URL,
  FOUNDRY_API_KEY: env.FOUNDRY_API_KEY,
  FOUNDRY_MAX_REQUEST_TOKENS: env.FOUNDRY_MAX_REQUEST_TOKENS,
  FOUNDRY_DEFAULT_OUTPUT_RESERVATION_TOKENS:
    env.FOUNDRY_DEFAULT_OUTPUT_RESERVATION_TOKENS,

  RESEND_FROM: env.RESEND_FROM,
  RESEND_API_KEY: env.RESEND_API_KEY,

  CLOUDINARY_NAME: env.CLOUDINARY_NAME,
  CLOUDINARY_API_KEY: env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: env.CLOUDINARY_API_SECRET,

  R2_ACCOUNT_ID: env.R2_ACCOUNT_ID,
  R2_BUCKET_NAME: env.R2_BUCKET_NAME,
  R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
  R2_PUBLIC_BASE_URL: env.R2_PUBLIC_BASE_URL,
  R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY,

  CACHE_DRIVER: env.CACHE_DRIVER,
  REDIS_URL: env.REDIS_URL,
} as const;

export default cfg;
