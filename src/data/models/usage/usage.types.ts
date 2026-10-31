export type UsageStatus =
  | "FAILED"
  | "PENDING"
  | "REJECTED"
  | "SUCCEEDED"
  | "INTERRUPTED";

export type FinalUsageStatus = Exclude<UsageStatus, "PENDING">;

export interface UsageRecord {
  id: string;
  keyId: string;
  memberId: string;
  requestedAt: Date;
  status: UsageStatus;
  model: string | null;
  completedAt: Date | null;
  latencyMs: number | null;
  httpStatus: number | null;
  totalTokens: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  quotaReservationId: string | null;
}

export type NewUsageRecord = Omit<UsageRecord, "id">;

export interface UsageFinalization {
  usageId: string;
  completedAt: Date;
  latencyMs: number;
  status: FinalUsageStatus;
  httpStatus: number | null;
  inputTokens: number | null;
  totalTokens: number | null;
  outputTokens: number | null;
  quotaReservationId: string | null;
}

/** Opaque transaction handle. */
export type TransactionContext = unknown;
