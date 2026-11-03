import { randomUUID } from "node:crypto";
import type {
  QuotaUsageSnapshot,
  QuotaReservationRecord,
} from "../../../data/models/quota/quota.types.js";
import { container, inject, injectable } from "tsyringe";
import { IOCTokens } from "../../../global/constants/ioc-tokens.js";
import type { IQuotaStore } from "./contracts/quota-store.contract.js";
import type { ApiKeyLimits } from "../../../data/models/api-key/api-key.types.js";

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

@injectable()
class QuotaService {
  constructor(
    @inject(IOCTokens.QuotaStore)
    private readonly quotaStore: IQuotaStore,
  ) {}

  async reserve(params: {
    keyId: string;
    memberId: string;
    limits: ApiKeyLimits;
    reservedTokens: number;
  }) {
    assertPositiveSafeInteger(params.reservedTokens, "reservedTokens");

    return this.quotaStore.reserve({
      ...params,
      reservationId: randomUUID(),
      now: new Date(),
    });
  }

  async completeWithUsage(params: {
    reservationId: string;
    actualTokens: number;
  }): Promise<QuotaReservationRecord | null> {
    assertNonNegativeSafeInteger(params.actualTokens, "actualTokens");

    return this.quotaStore.settle({
      ...params,
      completedAt: new Date(),
    });
  }

  async completeWithoutUsage(
    reservationId: string,
  ): Promise<QuotaReservationRecord | null> {
    return this.quotaStore.settleEstimate({
      reservationId,
      completedAt: new Date(),
    });
  }

  async releaseBeforeUpstream(reservationId: string): Promise<boolean> {
    return this.quotaStore.release({
      reservationId,
      completedAt: new Date(),
    });
  }

  async getCurrentUsage(params: {
    keyId: string;
    now: Date;
  }): Promise<QuotaUsageSnapshot> {
    return this.quotaStore.getCurrentUsage(params);
  }
}

const quotaService = container.resolve(QuotaService);
export default quotaService;
