import type {
  UsageRecord,
  NewUsageRecord,
  UsageFinalization,
  TransactionContext,
  UsageMonthlySummary,
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

  getMonthlySummary(params: {
    keyId: string;
    from: Date;
    to: Date;
  }): Promise<UsageMonthlySummary>;
}
