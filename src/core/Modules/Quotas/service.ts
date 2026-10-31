import type {
  QuotaReserveResult,
  QuotaReservationRecord,
} from "../../../data/models/quota/index.js";
import { randomUUID } from "node:crypto";
import { QuotaRepository } from "../../../data/models/quota/index.js";
import { withTransaction } from "../../../data/transactions/mongo/index.js";
import type { ApiKeyLimits } from "../../../data/models/api-key/api-key.types.js";

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

function assertNonNegativeSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a nonnegative safe integer`);
  }
}

class QuotaService {
  private readonly quotaRepository = new QuotaRepository();

  async reserve(params: {
    keyId: string;
    memberId: string;
    limits: ApiKeyLimits;
    reservedTokens: number;
  }): Promise<QuotaReserveResult> {
    assertPositiveSafeInteger(params.reservedTokens, "reservedTokens");

    const reservationId = randomUUID();
    const now = new Date();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await withTransaction((session) =>
          this.quotaRepository.reserve({
            now,
            ...params,
            reservationId,
            session,
          }),
        );
      } catch (error) {
        if (!isDuplicateKeyError(error) || attempt === 2) {
          throw error;
        }
      }
    }

    throw new Error("Quota reservation could not be completed");
  }

  async completeWithUsage(params: {
    reservationId: string;
    actualTokens: number;
  }): Promise<QuotaReservationRecord | null> {
    assertNonNegativeSafeInteger(params.actualTokens, "actualTokens");

    return withTransaction((session) =>
      this.quotaRepository.completeWithUsage({
        ...params,
        completedAt: new Date(),
        session,
      }),
    );
  }

  async completeWithoutUsage(
    reservationId: string,
  ): Promise<QuotaReservationRecord | null> {
    return withTransaction((session) =>
      this.quotaRepository.completeWithoutUsage({
        reservationId,
        completedAt: new Date(),
        session,
      }),
    );
  }

  async releaseBeforeUpstream(reservationId: string): Promise<boolean> {
    return withTransaction((session) =>
      this.quotaRepository.releaseBeforeUpstream({
        reservationId,
        completedAt: new Date(),
        session,
      }),
    );
  }
}

const quotaService = new QuotaService();
export default quotaService;
