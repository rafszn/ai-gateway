import type { AdminPermission } from "./permissions.js";
import type { AdminRole } from "../../../data/models/admin/admin.types.js";

export {};

declare global {
  namespace Express {
    interface Request {
      admin?: {
        id: string;
        role: AdminRole;
        username: string;
        permissions: AdminPermission[];
      };
    }
  }
}
