import type {
  QuotaReserveResult,
  QuotaUsageSnapshot,
  QuotaReservationRecord,
} from "../../../../data/models/quota/quota.types.js";
import type { ApiKeyLimits } from "../../../../data/models/api-key/api-key.types.js";

export interface IQuotaStore {
  start(): void;

  reserve(params: {
    now: Date;
    keyId: string;
    memberId: string;
    limits: ApiKeyLimits;
    reservedTokens: number;
    reservationId: string;
  }): Promise<QuotaReserveResult>;

  settle(params: {
    completedAt: Date;
    actualTokens: number;
    reservationId: string;
  }): Promise<QuotaReservationRecord | null>;

  settleEstimate(params: {
    completedAt: Date;
    reservationId: string;
  }): Promise<QuotaReservationRecord | null>;

  release(params: {
    completedAt: Date;
    reservationId: string;
  }): Promise<boolean>;

  getCurrentUsage(params: {
    now: Date;
    keyId: string;
  }): Promise<QuotaUsageSnapshot>;

  flush(): Promise<void>;
}
