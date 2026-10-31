export type AdminRole = "SUPER_ADMIN" | "ADMIN";

/** Opaque transaction handle. */
export type TransactionContext = unknown;

export interface AdminRecord {
  id: string;
  role: AdminRole;
  createdAt: Date;
  updatedAt: Date;
  username: string;
  isActive: boolean;
  passwordHash: string;
}

export type NewAdminRecord = Pick<
  AdminRecord,
  "username" | "role" | "isActive" | "passwordHash"
>;

export interface AdminRoleRecord {
  name: AdminRole;
  permissions: string[];
}
