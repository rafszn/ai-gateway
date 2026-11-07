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

  /** */
  quotaUnits: number | null;
  cachedTokens: number | null;
  reasoningTokens: number | null;
  cacheWriteTokens: number | null;

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

  /** */
  quotaUnits: number | null;
  cachedTokens: number | null;
  reasoningTokens: number | null;
  cacheWriteTokens: number | null;

  quotaReservationId: string | null;
}

export interface UsageMonthlySummary {
  requestCount: number;
  statusCounts: {
    pending: number;
    succeeded: number;
    failed: number;
    rejected: number;
    interrupted: number;
  };
  foundryReportedTokens: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  averageLatencyMs: number | null;
  byModel: Array<{
    model: string | null;
    requestCount: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }>;
  recentRequests: Array<{
    requestedAt: Date;
    model: string | null;
    status: UsageStatus;
    httpStatus: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    latencyMs: number | null;
  }>;
}

/** Opaque transaction handle. */
export type TransactionContext = unknown;
