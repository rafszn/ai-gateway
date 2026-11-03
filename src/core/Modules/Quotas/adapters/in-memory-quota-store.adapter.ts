import logger from "../../../../config.js";
import { inject, injectable } from "tsyringe";
import type {
  QuotaPeriods,
  QuotaTpmEvent,
  QuotaLimitName,
  QuotaPeriodCounter,
  QuotaReserveResult,
  QuotaCounterRecord,
  QuotaUsageSnapshot,
  QuotaReservationRecord,
} from "../../../../data/models/quota/quota.types.js";
import { MINUTE, SECOND } from "../../../../global/constants/time.js";
import { IOCTokens } from "../../../../global/constants/ioc-tokens.js";
import type { IQuotaStore } from "../contracts/quota-store.contract.js";
import type { ApiKeyLimits } from "../../../../data/models/api-key/api-key.types.js";
import type { IQuotaRepository } from "../../../../data/models/quota/quota.repository.js";

const TPM_WINDOW_MS = 1 * MINUTE;
const FLUSH_INTERVAL_MS = 4 * SECOND;

const LIMIT_NAMES: QuotaLimitName[] = ["tpm", "daily", "weekly", "monthly"];

interface LimitValues {
  tpm: number;
  daily: number;
  weekly: number;
  monthly: number;
}

function getUtcDateKey(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function getPeriods(date: Date): QuotaPeriods {
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  const weekStart = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() - daysSinceMonday,
    ),
  );

  return {
    daily: getUtcDateKey(date),
    weekly: getUtcDateKey(weekStart),
    monthly: `${date.getUTCFullYear()}-${String(
      date.getUTCMonth() + 1,
    ).padStart(2, "0")}`,
  };
}

function nextUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1),
  );
}

function nextUtcWeek(date: Date): Date {
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;

  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + (7 - daysSinceMonday),
    ),
  );
}

function nextUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

function secondsUntil(target: Date, now: Date): number {
  return Math.max(1, Math.ceil((target.getTime() - now.getTime()) / 1_000));
}

function cloneCounter(counter: QuotaCounterRecord): QuotaCounterRecord {
  return {
    keyId: counter.keyId,
    daily: { ...counter.daily },
    weekly: { ...counter.weekly },
    monthly: { ...counter.monthly },
    tpmEvents: counter.tpmEvents.map((event) => ({
      reservationId: event.reservationId,
      at: new Date(event.at.getTime()),
      tokens: event.tokens,
    })),
  };
}

function emptyCounter(keyId: string, now: Date): QuotaCounterRecord {
  const periods = getPeriods(now);

  return {
    keyId,
    daily: { period: periods.daily, tokens: 0 },
    weekly: { period: periods.weekly, tokens: 0 },
    monthly: { period: periods.monthly, tokens: 0 },
    tpmEvents: [],
  };
}

function copyReservation(
  reservation: QuotaReservationRecord,
): QuotaReservationRecord {
  return {
    ...reservation,
    reservedAt: new Date(reservation.reservedAt.getTime()),
    completedAt: reservation.completedAt
      ? new Date(reservation.completedAt.getTime())
      : null,
    periods: { ...reservation.periods },
  };
}

function getTpmUsage(events: QuotaTpmEvent[]): number {
  return events.reduce((total, event) => total + event.tokens, 0);
}

function getTpmRetryAfterSeconds(
  events: QuotaTpmEvent[],
  reservedTokens: number,
  limit: number,
  now: Date,
): number {
  let tokensToExpire = getTpmUsage(events) + reservedTokens - limit;

  if (tokensToExpire <= 0) {
    return 1;
  }

  const orderedEvents = [...events].sort(
    (left, right) => left.at.getTime() - right.at.getTime(),
  );

  for (const event of orderedEvents) {
    tokensToExpire -= event.tokens;

    if (tokensToExpire <= 0) {
      return secondsUntil(new Date(event.at.getTime() + TPM_WINDOW_MS), now);
    }
  }

  return 60;
}

function getLimitValues(limits: ApiKeyLimits): LimitValues {
  return {
    daily: limits.dailyTokens,
    weekly: limits.weeklyTokens,
    tpm: limits.tokensPerMinute,
    monthly: limits.monthlyTokens,
  };
}

function getBlockedLimits(
  counter: QuotaCounterRecord,
  limits: ApiKeyLimits,
  reservedTokens: number,
): QuotaLimitName[] {
  const blocked: QuotaLimitName[] = [];

  if (
    getTpmUsage(counter.tpmEvents) + reservedTokens >
    limits.tokensPerMinute
  ) {
    blocked.push("tpm");
  }

  if (counter.daily.tokens + reservedTokens > limits.dailyTokens) {
    blocked.push("daily");
  }

  if (counter.weekly.tokens + reservedTokens > limits.weeklyTokens) {
    blocked.push("weekly");
  }

  if (counter.monthly.tokens + reservedTokens > limits.monthlyTokens) {
    blocked.push("monthly");
  }

  return blocked;
}

function getRetryAfterSeconds(
  blockedLimits: QuotaLimitName[],
  counter: QuotaCounterRecord,
  limits: ApiKeyLimits,
  reservedTokens: number,
  now: Date,
): number {
  const waits: number[] = [];

  if (blockedLimits.includes("tpm")) {
    waits.push(
      getTpmRetryAfterSeconds(
        counter.tpmEvents,
        reservedTokens,
        limits.tokensPerMinute,
        now,
      ),
    );
  }

  if (blockedLimits.includes("daily")) {
    waits.push(secondsUntil(nextUtcDay(now), now));
  }

  if (blockedLimits.includes("weekly")) {
    waits.push(secondsUntil(nextUtcWeek(now), now));
  }

  if (blockedLimits.includes("monthly")) {
    waits.push(secondsUntil(nextUtcMonth(now), now));
  }

  return Math.max(1, ...waits);
}

function adjustPeriod(
  current: QuotaPeriodCounter,
  reservedPeriod: string,
  tokenDelta: number,
): QuotaPeriodCounter {
  if (current.period !== reservedPeriod) {
    return current;
  }

  const tokens = current.tokens + tokenDelta;

  if (!Number.isSafeInteger(tokens) || tokens < 0) {
    throw new Error("Quota counter adjustment would be invalid");
  }

  return { period: current.period, tokens };
}

function addTokens(current: number, amount: number): number {
  const tokens = current + amount;

  if (!Number.isSafeInteger(tokens) || tokens < 0) {
    throw new Error("Quota counter value is invalid");
  }

  return tokens;
}

@injectable()
export class InMemoryQuotaStoreAdapter implements IQuotaStore {
  private readonly activeReservations = new Map<
    string,
    QuotaReservationRecord
  >();
  private readonly loadingCounters = new Map<
    string,
    Promise<QuotaCounterRecord>
  >();
  private readonly dirtyKeyIds = new Set<string>();
  private flushPromise: Promise<void> | null = null;
  private readonly revisions = new Map<string, number>();
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private readonly counters = new Map<string, QuotaCounterRecord>();

  constructor(
    @inject(IOCTokens.QuotaRepository)
    private readonly quotaRepository: IQuotaRepository,
  ) {}

  start(): void {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setInterval(() => {
      void this.flush().catch((error) => {
        logger.error("[QUOTA] Counter flush failed", error);
      });
    }, FLUSH_INTERVAL_MS);

    this.flushTimer.unref?.();
  }

  async reserve(params: {
    now: Date;
    keyId: string;
    memberId: string;
    limits: ApiKeyLimits;
    reservedTokens: number;
    reservationId: string;
  }): Promise<QuotaReserveResult> {
    const existingReservation = this.activeReservations.get(
      params.reservationId,
    );

    if (existingReservation) {
      return {
        type: "RESERVED",
        reservation: copyReservation(existingReservation),
      };
    }

    const limitValues = getLimitValues(params.limits);
    const maximumReservationTokens = Math.min(...Object.values(limitValues));
    const exceededLimits = LIMIT_NAMES.filter(
      (limit) => params.reservedTokens > limitValues[limit],
    );

    if (exceededLimits.length > 0) {
      return {
        type: "REQUEST_TOO_LARGE",
        maximumReservationTokens,
        exceededLimits,
      };
    }

    const counter = await this.getCounter(params.keyId, params.now);
    const blockedLimits = getBlockedLimits(
      counter,
      params.limits,
      params.reservedTokens,
    );

    if (blockedLimits.length > 0) {
      return {
        type: "LIMITED",
        blockedLimits,
        retryAfterSeconds: getRetryAfterSeconds(
          blockedLimits,
          counter,
          params.limits,
          params.reservedTokens,
          params.now,
        ),
      };
    }

    counter.daily.tokens = addTokens(
      counter.daily.tokens,
      params.reservedTokens,
    );
    counter.weekly.tokens = addTokens(
      counter.weekly.tokens,
      params.reservedTokens,
    );
    counter.monthly.tokens = addTokens(
      counter.monthly.tokens,
      params.reservedTokens,
    );
    counter.tpmEvents.push({
      reservationId: params.reservationId,
      at: new Date(params.now.getTime()),
      tokens: params.reservedTokens,
    });

    this.markDirty(counter.keyId);

    const reservation: QuotaReservationRecord = {
      id: params.reservationId,
      keyId: params.keyId,
      memberId: params.memberId,
      reservedTokens: params.reservedTokens,
      actualTokens: null,
      status: "RESERVED",
      reservedAt: new Date(params.now.getTime()),
      completedAt: null,
      periods: getPeriods(params.now),
    };

    this.activeReservations.set(reservation.id, reservation);

    return {
      type: "RESERVED",
      reservation: copyReservation(reservation),
    };
  }

  async settle(params: {
    completedAt: Date;
    actualTokens: number;
    reservationId: string;
  }): Promise<QuotaReservationRecord | null> {
    const reservation = this.activeReservations.get(params.reservationId);

    if (!reservation) {
      return null;
    }

    const counter = await this.getCounter(
      reservation.keyId,
      params.completedAt,
    );
    const tokenDelta = params.actualTokens - reservation.reservedTokens;
    const cutoff = params.completedAt.getTime() - TPM_WINDOW_MS;

    counter.daily = adjustPeriod(
      counter.daily,
      reservation.periods.daily,
      tokenDelta,
    );
    counter.weekly = adjustPeriod(
      counter.weekly,
      reservation.periods.weekly,
      tokenDelta,
    );
    counter.monthly = adjustPeriod(
      counter.monthly,
      reservation.periods.monthly,
      tokenDelta,
    );
    counter.tpmEvents = counter.tpmEvents
      .filter((event) => event.at.getTime() > cutoff)
      .map((event) =>
        event.reservationId === params.reservationId
          ? { ...event, tokens: params.actualTokens }
          : event,
      )
      .filter((event) => event.tokens > 0);

    this.markDirty(counter.keyId);

    reservation.actualTokens = params.actualTokens;
    reservation.status = "SETTLED";
    reservation.completedAt = new Date(params.completedAt.getTime());
    this.activeReservations.delete(params.reservationId);

    return copyReservation(reservation);
  }

  async settleEstimate(params: {
    reservationId: string;
    completedAt: Date;
  }): Promise<QuotaReservationRecord | null> {
    const reservation = this.activeReservations.get(params.reservationId);

    if (!reservation) {
      return null;
    }

    reservation.status = "CHARGED_ESTIMATE";
    reservation.completedAt = new Date(params.completedAt.getTime());
    this.activeReservations.delete(params.reservationId);

    return copyReservation(reservation);
  }

  async release(params: {
    reservationId: string;
    completedAt: Date;
  }): Promise<boolean> {
    const reservation = this.activeReservations.get(params.reservationId);

    if (!reservation) {
      return false;
    }

    const counter = await this.getCounter(
      reservation.keyId,
      params.completedAt,
    );

    counter.daily = adjustPeriod(
      counter.daily,
      reservation.periods.daily,
      -reservation.reservedTokens,
    );
    counter.weekly = adjustPeriod(
      counter.weekly,
      reservation.periods.weekly,
      -reservation.reservedTokens,
    );
    counter.monthly = adjustPeriod(
      counter.monthly,
      reservation.periods.monthly,
      -reservation.reservedTokens,
    );
    counter.tpmEvents = counter.tpmEvents.filter(
      (event) => event.reservationId !== params.reservationId,
    );

    this.markDirty(counter.keyId);

    reservation.status = "RELEASED";
    reservation.completedAt = new Date(params.completedAt.getTime());
    this.activeReservations.delete(params.reservationId);

    return true;
  }

  async getCurrentUsage(params: {
    keyId: string;
    now: Date;
  }): Promise<QuotaUsageSnapshot> {
    const counter = await this.getCounter(params.keyId, params.now);
    let nextTpmTokenExpiryAt: Date | null = null;

    for (const event of counter.tpmEvents) {
      const expiry = new Date(event.at.getTime() + TPM_WINDOW_MS);

      if (!nextTpmTokenExpiryAt || expiry < nextTpmTokenExpiryAt) {
        nextTpmTokenExpiryAt = expiry;
      }
    }

    return {
      tokensPerMinute: getTpmUsage(counter.tpmEvents),
      dailyTokens: counter.daily.tokens,
      weeklyTokens: counter.weekly.tokens,
      monthlyTokens: counter.monthly.tokens,
      nextTpmTokenExpiryAt,
    };
  }

  async flush(): Promise<void> {
    if (this.flushPromise) {
      await this.flushPromise;
      return;
    }

    const counters: QuotaCounterRecord[] = [];
    const capturedRevisions = new Map<string, number>();

    for (const keyId of this.dirtyKeyIds) {
      const counter = this.counters.get(keyId);

      if (!counter) {
        continue;
      }

      counters.push(cloneCounter(counter));
      capturedRevisions.set(keyId, this.revisions.get(keyId) ?? 0);
    }

    if (counters.length === 0) {
      return;
    }

    const flushPromise = (async () => {
      await this.quotaRepository.upsertCounters({ counters });

      for (const [keyId, revision] of capturedRevisions) {
        if ((this.revisions.get(keyId) ?? 0) === revision) {
          this.dirtyKeyIds.delete(keyId);
        }
      }
    })();

    this.flushPromise = flushPromise;

    try {
      await flushPromise;
    } finally {
      if (this.flushPromise === flushPromise) {
        this.flushPromise = null;
      }
    }
  }

  private async getCounter(
    keyId: string,
    now: Date,
  ): Promise<QuotaCounterRecord> {
    const existing = this.counters.get(keyId);

    if (existing) {
      this.normalizeCounter(existing, now);
      return existing;
    }

    let loading = this.loadingCounters.get(keyId);

    if (!loading) {
      loading = this.loadCounter(keyId, now);
      this.loadingCounters.set(keyId, loading);
    }

    try {
      const counter = await loading;
      this.normalizeCounter(counter, now);
      return counter;
    } finally {
      if (this.loadingCounters.get(keyId) === loading) {
        this.loadingCounters.delete(keyId);
      }
    }
  }

  private async loadCounter(
    keyId: string,
    now: Date,
  ): Promise<QuotaCounterRecord> {
    const persisted = await this.quotaRepository.findCounterByKeyId(keyId);
    const counter = persisted
      ? cloneCounter(persisted)
      : emptyCounter(keyId, now);

    this.counters.set(keyId, counter);
    this.normalizeCounter(counter, now);

    return counter;
  }

  private normalizeCounter(counter: QuotaCounterRecord, now: Date): void {
    const periods = getPeriods(now);
    let changed = false;

    if (counter.daily.period !== periods.daily) {
      counter.daily = { period: periods.daily, tokens: 0 };
      changed = true;
    }

    if (counter.weekly.period !== periods.weekly) {
      counter.weekly = { period: periods.weekly, tokens: 0 };
      changed = true;
    }

    if (counter.monthly.period !== periods.monthly) {
      counter.monthly = { period: periods.monthly, tokens: 0 };
      changed = true;
    }

    const cutoff = now.getTime() - TPM_WINDOW_MS;
    const activeEvents = counter.tpmEvents.filter(
      (event) => event.at.getTime() > cutoff,
    );

    if (activeEvents.length !== counter.tpmEvents.length) {
      counter.tpmEvents = activeEvents;
      changed = true;
    }

    if (changed) {
      this.markDirty(counter.keyId);
    }
  }

  private markDirty(keyId: string): void {
    this.dirtyKeyIds.add(keyId);
    this.revisions.set(keyId, (this.revisions.get(keyId) ?? 0) + 1);
  }
}
