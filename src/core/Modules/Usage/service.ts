import type {
  UsageRecord,
  FinalUsageStatus,
} from "../../../data/models/usage/index.js";
import { UsageRepository } from "../../../data/models/usage/index.js";

class UsageService {
  private readonly usageRepository = new UsageRepository();

  async start(params: {
    memberId: string;
    keyId: string;
    model: string | null;
    requestedAt: Date;
  }): Promise<UsageRecord> {
    return this.usageRepository.create({
      record: {
        ...params,
        status: "PENDING",
        quotaReservationId: null,
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        httpStatus: null,
        latencyMs: null,
        completedAt: null,
      },
    });
  }

  async finish(params: {
    usageId: string;
    completedAt: Date;
    latencyMs: number;
    status: FinalUsageStatus;
    httpStatus: number | null;
    inputTokens: number | null;
    totalTokens: number | null;
    outputTokens: number | null;
    quotaReservationId: string | null;
  }): Promise<UsageRecord | null> {
    return this.usageRepository.finalize({ changes: params });
  }
}

const usageService = new UsageService();
export default usageService;
