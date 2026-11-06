import type {
  FinalUsageStatus,
  IUsageRepository,
  UsageRecord,
} from "../../../data/models/usage/index.js";
import type {
  ApiKeyRecord,
  IApiKeyRepository,
} from "../../../data/models/api-key/index.js";
import { container, inject, injectable } from "tsyringe";
import { DAY, MINUTE } from "../../../global/constants/time.js";
import { IOCTokens } from "../../../global/constants/ioc-tokens.js";
import { AppError } from "../../../global/middlewares/error-handler.js";
import type { IQuotaStore } from "../Quotas/contracts/quota-store.contract.js";

const DAY_MS = 1 * DAY;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TPM_WINDOW_MS = 1 * MINUTE;

function getUtcMonthRange(now: Date): { from: Date; to: Date } {
  return {
    from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}

function getUtcCalendarWindows(now: Date) {
  const dayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const daysSinceMonday = (now.getUTCDay() + 6) % 7;

  return {
    dailyStart: dayStart,
    dailyReset: new Date(dayStart.getTime() + DAY_MS),
    weeklyStart: new Date(dayStart.getTime() - daysSinceMonday * DAY_MS),
    weeklyReset: new Date(dayStart.getTime() + (7 - daysSinceMonday) * DAY_MS),
    monthlyStart: new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    ),
    monthlyReset: new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    ),
  };
}

function buildWindow(params: {
  window: string;
  usedTokens: number;
  limitTokens: number;
  startsAt: Date;
  resetsAt: Date | null;
}) {
  return {
    window: params.window,
    startsAt: params.startsAt,
    resetsAt: params.resetsAt,
    usedTokens: params.usedTokens,
    /* limitTokens: params.limitTokens, */
    /* 
    usagePercent: (params.usedTokens / params.limitTokens) * 100,
    */
    remainingTokens: Math.max(0, params.limitTokens - params.usedTokens),
    usagePercentReadable: `${((params.usedTokens / params.limitTokens) * 100).toFixed(2)}%`,
  };
}

function getCurrentKeyStatus(key: ApiKeyRecord, now: Date) {
  if (key.status === "ACTIVE" && key.expiresAt.getTime() <= now.getTime()) {
    return "EXPIRED" as const;
  }

  return key.status;
}

@injectable()
class UsageService {
  constructor(
    @inject(IOCTokens.QuotaStore)
    private readonly quotaStore: IQuotaStore,

    @inject(IOCTokens.UsageRepository)
    private readonly usageRepository: IUsageRepository,

    @inject(IOCTokens.ApiKeyRepository)
    private readonly apiKeyRepository: IApiKeyRepository,
  ) {}

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

  async getPublicUsage(keyName: string) {
    const matches = await this.apiKeyRepository.findByNormalizedName(
      keyName.trim().toLowerCase(),
    );

    if (matches.length === 0) {
      throw new AppError("API key not found", 404);
    }

    if (matches.length > 1) {
      throw new AppError(
        "This key name is ambiguous. Ask an administrator to make it unique.",
        409,
      );
    }

    const key = matches[0];
    const now = new Date();
    const month = getUtcMonthRange(now);
    const calendar = getUtcCalendarWindows(now);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [quotaUsage, monthSummary] = await Promise.all([
      this.quotaStore.getCurrentUsage({
        keyId: key.id,
        now,
      }),
      this.usageRepository.getMonthlySummary({
        keyId: key.id,
        from: month.from,
        to: month.to,
      }),
    ]);

    return {
      generatedAt: now,
      key: {
        name: key.name,
        status: getCurrentKeyStatus(key, now),
        expiresAt: key.expiresAt,
        allowedModels: key.models,
      },
      quotaAccounting: "Quota usage includes active reservations.",
      quota: {
        /* 
        tokensPerMinute: buildWindow({
          window: "rolling_60_seconds",
          startsAt: new Date(now.getTime() - TPM_WINDOW_MS),
          resetsAt: quotaUsage.nextTpmTokenExpiryAt,
          usedTokens: quotaUsage.tokensPerMinute,
          limitTokens: key.limits.tokensPerMinute,
        }),
        */
        daily: buildWindow({
          window: "utc_calendar_day",
          startsAt: calendar.dailyStart,
          resetsAt: calendar.dailyReset,
          usedTokens: quotaUsage.dailyTokens,
          limitTokens: key.limits.dailyTokens,
        }),
        weekly: buildWindow({
          window: "utc_calendar_week_monday_start",
          startsAt: calendar.weeklyStart,
          resetsAt: calendar.weeklyReset,
          usedTokens: quotaUsage.weeklyTokens,
          limitTokens: key.limits.weeklyTokens,
        }),
        monthly: buildWindow({
          window: "utc_calendar_month",
          startsAt: calendar.monthlyStart,
          resetsAt: calendar.monthlyReset,
          usedTokens: quotaUsage.monthlyTokens,
          limitTokens: key.limits.monthlyTokens,
        }),
      },
      /* 
      monthToDate: {
        startsAt: month.from,
        resetsAt: month.to,
        requests: {
          total: monthSummary.requestCount,
          byStatus: monthSummary.statusCounts,
        },
         foundryReportedTokens: monthSummary.foundryReportedTokens,
        averageLatencyMs: monthSummary.averageLatencyMs,
      byModel: monthSummary.byModel, 
        recentRequests: monthSummary.recentRequests, 
      } 
      */
    };
  }
}

const usageService = container.resolve(UsageService);
export default usageService;
