import type {
  ApiKeyLimits,
  ApiKeyRecord,
} from "../../../data/models/api-key/index.js";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { UserRepository } from "../../../data/models/user/index.js";
import type { CreateApiKeyDTO, UpdateApiKeyLimitsDTO } from "./dto.js";
import { AppError } from "../../../global/middlewares/error-handler.js";
import { ApiKeyRepository } from "../../../data/models/api-key/index.js";
import {
  KEY_LIFETIME_MS,
  TIER_LIMITS,
} from "../../../global/constants/default-tiers.js";

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

function effectiveStatus(key: ApiKeyRecord, now: Date): ApiKeyRecord {
  if (key.status === "ACTIVE" && key.expiresAt.getTime() <= now.getTime()) {
    return { ...key, status: "EXPIRED" };
  }

  return key;
}

class ApiKeyService {
  private readonly userRepository = new UserRepository();
  private readonly apiKeyRepository = new ApiKeyRepository();

  private async requireMember(memberId: string): Promise<void> {
    const member = await this.userRepository.findById(memberId);

    if (!member) {
      throw new AppError("Member not found", 404);
    }
  }

  private async getKey(params: {
    memberId: string;
    keyId: string;
  }): Promise<ApiKeyRecord> {
    await this.requireMember(params.memberId);

    const key = await this.apiKeyRepository.findById(params);

    if (!key) {
      throw new AppError("API key not found", 404);
    }

    return effectiveStatus(key, new Date());
  }

  private async getEditableKey(params: {
    memberId: string;
    keyId: string;
  }): Promise<ApiKeyRecord> {
    const key = await this.getKey(params);

    if (key.status === "REVOKED") {
      throw new AppError("Revoked API keys cannot be changed", 409);
    }

    return key;
  }

  async createKey(params: {
    memberId: string;
    adminId: string;
    input: CreateApiKeyDTO;
  }): Promise<{ key: ApiKeyRecord; secret: string }> {
    await this.requireMember(params.memberId);

    const now = new Date();
    const secret = `sk-gw-${randomBytes(32).toString("base64url")}`;
    const name = params.input.name ?? `key-${randomUUID()}`;
    const limits: ApiKeyLimits = {
      ...TIER_LIMITS[params.input.tier],
      ...params.input.limits,
    };

    try {
      const key = await this.apiKeyRepository.create({
        record: {
          name,
          limits,
          revokedAt: null,
          status: "ACTIVE",
          activatedAt: now,
          revokedByAdminId: null,
          lastReactivatedAt: null,
          memberId: params.memberId,
          models: params.input.models,
          secretHash: hashSecret(secret),
          lastReactivatedByAdminId: null,
          keyPrefix: secret.slice(0, 12),
          createdByAdminId: params.adminId,
          nameNormalized: name.toLowerCase(),
          expiresAt: new Date(now.getTime() + KEY_LIFETIME_MS),
        },
      });

      return { key, secret };
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new AppError(
          "An API key with this name already exists for the member",
          409,
        );
      }

      throw error;
    }
  }

  async listKeys(params: { memberId: string; page: number; limit: number }) {
    await this.requireMember(params.memberId);

    const result = await this.apiKeyRepository.listByMemberId({
      memberId: params.memberId,
      offset: (params.page - 1) * params.limit,
      limit: params.limit,
    });

    const now = new Date();

    return {
      items: result.items.map((key) => effectiveStatus(key, now)),
      page: params.page,
      limit: params.limit,
      total: result.total,
      totalPages: Math.ceil(result.total / params.limit),
    };
  }

  async updateName(params: {
    memberId: string;
    keyId: string;
    name: string;
  }): Promise<ApiKeyRecord> {
    await this.getEditableKey(params);

    try {
      const key = await this.apiKeyRepository.updateName({
        memberId: params.memberId,
        keyId: params.keyId,
        name: params.name,
        nameNormalized: params.name.toLowerCase(),
      });

      if (!key) {
        throw new AppError("API key not found", 404);
      }

      return effectiveStatus(key, new Date());
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new AppError(
          "An API key with this name already exists for the member",
          409,
        );
      }

      throw error;
    }
  }

  async replaceModels(params: {
    memberId: string;
    keyId: string;
    models: string[];
  }): Promise<ApiKeyRecord> {
    await this.getEditableKey(params);

    const key = await this.apiKeyRepository.replaceModels(params);

    if (!key) {
      throw new AppError("API key not found", 404);
    }

    return effectiveStatus(key, new Date());
  }

  async updateLimits(params: {
    memberId: string;
    keyId: string;
    changes: UpdateApiKeyLimitsDTO;
  }): Promise<ApiKeyRecord> {
    await this.getEditableKey(params);

    const key = await this.apiKeyRepository.updateLimits(params);

    if (!key) {
      throw new AppError("API key not found", 404);
    }

    return effectiveStatus(key, new Date());
  }

  async revokeKey(params: {
    memberId: string;
    keyId: string;
    adminId: string;
  }): Promise<ApiKeyRecord> {
    const current = await this.getKey(params);

    if (current.status === "REVOKED") {
      return current;
    }

    const key = await this.apiKeyRepository.revoke({
      memberId: params.memberId,
      keyId: params.keyId,
      revokedAt: new Date(),
      revokedByAdminId: params.adminId,
    });

    if (key) {
      return key;
    }

    return this.getKey(params);
  }

  async reactivateKey(params: {
    keyId: string;
    adminId: string;
    memberId: string;
  }): Promise<ApiKeyRecord> {
    const current = await this.getKey(params);
    const now = new Date();

    if (current.status === "REVOKED") {
      throw new AppError("Revoked API keys cannot be reactivated", 409);
    }

    if (current.expiresAt.getTime() > now.getTime()) {
      throw new AppError("API key has not expired", 409);
    }

    const key = await this.apiKeyRepository.reactivate({
      activatedAt: now,
      keyId: params.keyId,
      memberId: params.memberId,
      reactivatedByAdminId: params.adminId,
      expiresAt: new Date(now.getTime() + KEY_LIFETIME_MS),
    });

    if (key) {
      return key;
    }

    const latest = await this.getKey(params);

    if (latest.status === "REVOKED") {
      throw new AppError("Revoked API keys cannot be reactivated", 409);
    }

    if (latest.expiresAt.getTime() > now.getTime()) {
      throw new AppError("API key has not expired", 409);
    }

    throw new AppError("API key could not be reactivated", 409);
  }

  async deleteKey(params: { memberId: string; keyId: string }): Promise<void> {
    await this.getKey(params);

    const deleted = await this.apiKeyRepository.deleteById(params);

    if (!deleted) {
      throw new AppError("API key not found", 404);
    }
  }

  async authenticateSecret(
    secret: string,
  ): Promise<{ memberId: string; key: ApiKeyRecord } | null> {
    if (!secret || secret.length > 256) {
      return null;
    }

    const key = await this.apiKeyRepository.findBySecretHash(
      hashSecret(secret),
    );

    if (
      !key ||
      key.status !== "ACTIVE" ||
      key.expiresAt.getTime() <= Date.now()
    ) {
      return null;
    }

    const member = await this.userRepository.findById(key.memberId);

    if (!member) {
      return null;
    }

    return {
      memberId: key.memberId,
      key,
    };
  }
}

const apiKeyService = new ApiKeyService();
export default apiKeyService;
