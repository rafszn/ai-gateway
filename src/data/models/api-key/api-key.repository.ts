import type {
  ApiKeyLimitChanges,
  ApiKeyRecord,
  NewApiKeyRecord,
  TransactionContext,
} from "./api-key.types.js";

export interface IApiKeyRepository {
  findById(params: {
    keyId: string;
    memberId: string;
  }): Promise<ApiKeyRecord | null>;

  findBySecretHash(secretHash: string): Promise<ApiKeyRecord | null>;

  findByNormalizedName(nameNormalized: string): Promise<ApiKeyRecord[]>;

  listByMemberId(params: {
    limit: number;
    offset: number;
    memberId: string;
  }): Promise<{
    items: ApiKeyRecord[];
    total: number;
  }>;

  create(params: {
    record: NewApiKeyRecord;
    session?: TransactionContext;
  }): Promise<ApiKeyRecord>;

  updateName(params: {
    name: string;
    keyId: string;
    memberId: string;
    nameNormalized: string;
    session?: TransactionContext;
  }): Promise<ApiKeyRecord | null>;

  replaceModels(params: {
    keyId: string;
    memberId: string;
    models: string[];
    session?: TransactionContext;
  }): Promise<ApiKeyRecord | null>;

  updateLimits(params: {
    keyId: string;
    memberId: string;
    changes: ApiKeyLimitChanges;
    session?: TransactionContext;
  }): Promise<ApiKeyRecord | null>;

  revoke(params: {
    keyId: string;
    revokedAt: Date;
    memberId: string;
    revokedByAdminId: string;
    session?: TransactionContext;
  }): Promise<ApiKeyRecord | null>;

  revokeAllByMemberId(params: {
    memberId: string;
    revokedAt: Date;
    revokedByAdminId: string;
    session?: TransactionContext;
  }): Promise<number>;

  reactivate(params: {
    keyId: string;
    expiresAt: Date;
    memberId: string;
    activatedAt: Date;
    reactivatedByAdminId: string;
    session?: TransactionContext;
  }): Promise<ApiKeyRecord | null>;

  expireDue(params: {
    now: Date;
    session?: TransactionContext;
  }): Promise<number>;

  deleteById(params: {
    keyId: string;
    memberId: string;
    session?: TransactionContext;
  }): Promise<boolean>;
}
