import type { ApiKeyRecord } from "../../../../data/models/api-key/api-key.types.js";

export interface ApiKeyAuthResult {
  memberId: string;
  key: ApiKeyRecord;
}

export type ApiKeyAuthCacheValue = ApiKeyAuthResult | null;

export type ApiKeyAuthCacheLookup =
  | { hit: false }
  | { hit: true; value: ApiKeyAuthCacheValue };

export interface IApiKeyAuthCache {
  clear(): Promise<void>;
  set(params: {
    ttlMs: number;
    keyId?: string;
    memberId?: string;
    secretHash: string;
    value: ApiKeyAuthCacheValue;
  }): Promise<void>;
  invalidateKey(keyId: string): Promise<void>;
  invalidateMember(memberId: string): Promise<void>;
  get(secretHash: string): Promise<ApiKeyAuthCacheLookup>;
}
