import type {
  QuotaReserveResult,
  TransactionContext,
  QuotaReservationRecord,
} from "./quota.types.js";
import type { ApiKeyLimits } from "../api-key/api-key.types.js";

export interface IQuotaRepository {
  reserve(params: {
    now: Date;
    keyId: string;
    memberId: string;
    limits: ApiKeyLimits;
    reservationId: string;
    reservedTokens: number;
    session?: TransactionContext;
  }): Promise<QuotaReserveResult>;

  completeWithUsage(params: {
    completedAt: Date;
    actualTokens: number;
    reservationId: string;
    session?: TransactionContext;
  }): Promise<QuotaReservationRecord | null>;

  completeWithoutUsage(params: {
    completedAt: Date;
    reservationId: string;
    session?: TransactionContext;
  }): Promise<QuotaReservationRecord | null>;

  releaseBeforeUpstream(params: {
    completedAt: Date;
    reservationId: string;
    session?: TransactionContext;
  }): Promise<boolean>;
}
