import type {
  AdminRole,
  AdminRecord,
  NewAdminRecord,
  AdminRoleRecord,
  TransactionContext,
} from "./admin.types.js";

export interface IAdminRepository {
  findByUsername(username: string): Promise<AdminRecord | null>;
  findById(id: string): Promise<AdminRecord | null>;
  findRoleByName(name: AdminRole): Promise<AdminRoleRecord | null>;

  create(params: {
    record: NewAdminRecord;
    session?: TransactionContext;
  }): Promise<AdminRecord>;

  upsertRole(params: {
    record: AdminRoleRecord;
    session?: TransactionContext;
  }): Promise<AdminRoleRecord>;
}
