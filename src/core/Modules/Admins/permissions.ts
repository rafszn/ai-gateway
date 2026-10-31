import type { AdminRole } from "../../../data/models/admin/admin.types.js";

export const ADMIN_PERMISSIONS = [
  /** member */
  "members.read",
  "members.create",
  "members.update",
  "members.delete",

  /** keys */
  "keys.read",
  "keys.create",
  "keys.update",
  "keys.revoke",
  "keys.delete",

  /** models */
  "models.read",
  "models.update",

  /** limits */
  "limits.read",
  "limits.update",

  /** usage */
  "usage.read",

  /** admin */
  "admins.create",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export const ADMIN_ROLE_PERMISSIONS: Readonly<
  Record<AdminRole, readonly AdminPermission[]>
> = {
  SUPER_ADMIN: ADMIN_PERMISSIONS,
  ADMIN: ADMIN_PERMISSIONS.filter(
    (permission) =>
      permission !== "admins.create" && !permission.endsWith(".delete"),
  ),
};
