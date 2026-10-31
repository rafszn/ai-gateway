export type ApiKeyStatus = "ACTIVE" | "EXPIRED" | "REVOKED";

export interface ApiKeyLimits {
  dailyTokens: number;
  weeklyTokens: number;
  monthlyTokens: number;
  tokensPerMinute: number;
}

export type ApiKeyLimitChanges = Partial<ApiKeyLimits>;

export interface ApiKeyRecord {
  id: string;
  name: string;
  expiresAt: Date;
  createdAt: Date;
  memberId: string;
  updatedAt: Date;
  models: string[];
  activatedAt: Date;
  keyPrefix: string;
  limits: ApiKeyLimits;
  status: ApiKeyStatus;
  revokedAt: Date | null;
  createdByAdminId: string;
  lastReactivatedAt: Date | null;
  revokedByAdminId: string | null;
  lastReactivatedByAdminId: string | null;
}

export type NewApiKeyRecord = Omit<
  ApiKeyRecord,
  "id" | "createdAt" | "updatedAt"
> & {
  secretHash: string;
  nameNormalized: string;
};

/** Opaque transaction handle. */
export type TransactionContext = unknown;
