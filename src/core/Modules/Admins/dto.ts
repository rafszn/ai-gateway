import { z } from "zod";

const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .regex(/^[a-zA-Z0-9._-]+$/)
  .transform((username) => username.toLowerCase());

export const adminLoginSchema = z
  .object({
    username: usernameSchema,
    password: z.string().min(1).max(128),
  })
  .strict();

export const createAdminSchema = z
  .object({
    username: usernameSchema,
    password: z.string().min(12).max(128),
  })
  .strict();

export type AdminLoginDTO = z.infer<typeof adminLoginSchema>;
export type CreateAdminDTO = z.infer<typeof createAdminSchema>;
