import type { QuotaCounterRecord, TransactionContext } from "./quota.types.js";

export interface IQuotaRepository {
  findCounterByKeyId(keyId: string): Promise<QuotaCounterRecord | null>;

  upsertCounters(params: {
    counters: QuotaCounterRecord[];
    session?: TransactionContext;
  }): Promise<void>;
}
