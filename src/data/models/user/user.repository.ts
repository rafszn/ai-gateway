import { UserRecord, NewUserRecord, TransactionContext } from "./user.types.js";

export interface IUserRepository {
  create(params: {
    record: NewUserRecord;
    session?: TransactionContext;
  }): Promise<UserRecord>;
}
