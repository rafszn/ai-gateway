import type {
  IApiKeyAuthCache,
  ApiKeyAuthCacheValue,
  ApiKeyAuthCacheLookup,
} from "../contracts/api-key-auth-cache.contract.js";

const MAX_CACHE_ENTRIES = 20_000;
const EXPIRED_ENTRY_SWEEP_INTERVAL = 256;

interface CacheEntry {
  keyId?: string;
  expiresAt: number;
  memberId?: string;
  value: ApiKeyAuthCacheValue;
}

export class InMemoryApiKeyAuthCacheAdapter implements IApiKeyAuthCache {
  private writesSinceSweep = 0;
  private readonly entries = new Map<string, CacheEntry>();
  private readonly hashesByKeyId = new Map<string, Set<string>>();
  private readonly hashesByMemberId = new Map<string, Set<string>>();

  async get(secretHash: string): Promise<ApiKeyAuthCacheLookup> {
    const entry = this.entries.get(secretHash);

    if (!entry) {
      return { hit: false };
    }

    if (entry.expiresAt <= Date.now()) {
      this.remove(secretHash);
      return { hit: false };
    }

    return { hit: true, value: entry.value };
  }

  async set(params: {
    ttlMs: number;
    keyId?: string;
    memberId?: string;
    secretHash: string;
    value: ApiKeyAuthCacheValue;
  }): Promise<void> {
    this.remove(params.secretHash);

    if (params.ttlMs <= 0) {
      return;
    }

    this.writesSinceSweep += 1;

    if (this.writesSinceSweep >= EXPIRED_ENTRY_SWEEP_INTERVAL) {
      this.writesSinceSweep = 0;
      this.removeExpiredEntries(Date.now());
    }

    while (this.entries.size >= MAX_CACHE_ENTRIES) {
      const oldestHash = this.entries.keys().next().value;

      if (oldestHash === undefined) {
        break;
      }

      this.remove(oldestHash);
    }

    const keyId = params.keyId ?? params.value?.key.id;
    const memberId = params.memberId ?? params.value?.memberId;

    this.entries.set(params.secretHash, {
      value: params.value,
      expiresAt: Date.now() + params.ttlMs,
      keyId,
      memberId,
    });

    this.addToIndex(this.hashesByKeyId, keyId, params.secretHash);
    this.addToIndex(this.hashesByMemberId, memberId, params.secretHash);
  }

  async invalidateKey(keyId: string): Promise<void> {
    this.removeIndexedEntries(this.hashesByKeyId, keyId);
  }

  async invalidateMember(memberId: string): Promise<void> {
    this.removeIndexedEntries(this.hashesByMemberId, memberId);
  }

  async clear(): Promise<void> {
    this.entries.clear();
    this.hashesByKeyId.clear();
    this.hashesByMemberId.clear();
  }

  private removeExpiredEntries(now: number): void {
    for (const [secretHash, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.remove(secretHash);
      }
    }
  }

  private removeIndexedEntries(
    index: Map<string, Set<string>>,
    identifier: string,
  ): void {
    const secretHashes = index.get(identifier);

    if (!secretHashes) {
      return;
    }

    for (const secretHash of [...secretHashes]) {
      this.remove(secretHash);
    }
  }

  private addToIndex(
    index: Map<string, Set<string>>,
    identifier: string | undefined,
    secretHash: string,
  ): void {
    if (!identifier) {
      return;
    }

    let secretHashes = index.get(identifier);

    if (!secretHashes) {
      secretHashes = new Set<string>();
      index.set(identifier, secretHashes);
    }

    secretHashes.add(secretHash);
  }

  private removeFromIndex(
    index: Map<string, Set<string>>,
    identifier: string | undefined,
    secretHash: string,
  ): void {
    if (!identifier) {
      return;
    }

    const secretHashes = index.get(identifier);

    if (!secretHashes) {
      return;
    }

    secretHashes.delete(secretHash);

    if (secretHashes.size === 0) {
      index.delete(identifier);
    }
  }

  private remove(secretHash: string): void {
    const entry = this.entries.get(secretHash);

    if (!entry) {
      return;
    }

    this.entries.delete(secretHash);
    this.removeFromIndex(this.hashesByKeyId, entry.keyId, secretHash);
    this.removeFromIndex(this.hashesByMemberId, entry.memberId, secretHash);
  }
}
