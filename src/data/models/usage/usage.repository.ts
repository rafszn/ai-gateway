import type {
  NewUsageRecord,
  TransactionContext,
  UsageFinalization,
  UsageRecord,
} from "./usage.types.js";

export interface IUsageRepository {
  create(params: {
    record: NewUsageRecord;
    session?: TransactionContext;
  }): Promise<UsageRecord>;

  finalize(params: {
    changes: UsageFinalization;
    session?: TransactionContext;
  }): Promise<UsageRecord | null>;
}
