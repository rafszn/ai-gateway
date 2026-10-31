import { z } from "zod";

const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .regex(/^[a-zA-Z0-9._-]+$/)
  .transform((username) => username.toLowerCase());

const memberFieldsSchema = z
  .object({
    username: usernameSchema,
    email: z
      .email()
      .max(254)
      .transform((email) => email.toLowerCase()),
    firstName: z.string().trim().min(1).max(100).nullable().optional(),
    lastName: z.string().trim().min(1).max(100).nullable().optional(),
    phoneNumber: z.string().trim().max(32).nullable().optional(),
  })
  .strict();

export const createMemberSchema = memberFieldsSchema;

export const updateMemberSchema = memberFieldsSchema
  .partial()
  .refine((member) => Object.keys(member).length > 0, {
    message: "At least one member field must be provided",
  });

export const listMembersQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export type CreateMemberDTO = z.infer<typeof createMemberSchema>;
export type UpdateMemberDTO = z.infer<typeof updateMemberSchema>;
export type ListMembersQueryDTO = z.infer<typeof listMembersQuerySchema>;
