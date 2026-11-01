export type QuotaLimitName = "tpm" | "daily" | "weekly" | "monthly";

export type QuotaReservationStatus =
  | "RESERVED"
  | "SETTLED"
  | "RELEASED"
  | "CHARGED_ESTIMATE";

export interface QuotaPeriods {
  daily: string;
  weekly: string;
  monthly: string;
}

export interface QuotaUsageSnapshot {
  tokensPerMinute: number;
  dailyTokens: number;
  weeklyTokens: number;
  monthlyTokens: number;
  nextTpmTokenExpiryAt: Date | null;
}

export interface QuotaReservationRecord {
  id: string;
  keyId: string;
  memberId: string;
  reservedTokens: number;
  actualTokens: number | null;
  status: QuotaReservationStatus;
  reservedAt: Date;
  completedAt: Date | null;
  periods: QuotaPeriods;
}

export type QuotaReserveResult =
  | {
      type: "RESERVED";
      reservation: QuotaReservationRecord;
    }
  | {
      type: "LIMITED";
      blockedLimits: QuotaLimitName[];
      retryAfterSeconds: number;
    }
  | {
      type: "REQUEST_TOO_LARGE";
      maximumReservationTokens: number;
      exceededLimits: QuotaLimitName[];
    };

/** Opaque transaction handle. */
export type TransactionContext = unknown;
