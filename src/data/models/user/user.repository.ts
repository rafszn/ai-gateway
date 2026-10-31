import type {
  UserRecord,
  NewUserRecord,
  UpdateUserRecord,
  TransactionContext,
} from "./user.types.js";

export interface IUserRepository {
  findById(id: string): Promise<UserRecord | null>;

  list(params: { offset: number; limit: number }): Promise<{
    items: UserRecord[];
    total: number;
  }>;

  create(params: {
    record: NewUserRecord;
    session?: TransactionContext;
  }): Promise<UserRecord>;

  update(params: {
    id: string;
    changes: UpdateUserRecord;
    session?: TransactionContext;
  }): Promise<UserRecord | null>;

  deleteById(params: {
    id: string;
    session?: TransactionContext;
  }): Promise<UserRecord | null>;
}
