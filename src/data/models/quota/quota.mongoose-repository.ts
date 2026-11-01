import type {
  QuotaPeriods,
  QuotaReserveResult,
  TransactionContext,
  QuotaReservationRecord,
  QuotaUsageSnapshot,
} from "./quota.types.js";
import mongoose, { Schema, Types } from "mongoose";
import type { ClientSession, HydratedDocument } from "mongoose";
import type { ApiKeyLimits } from "../api-key/api-key.types.js";
import { IQuotaRepository } from "./quota.repository.js";

const TPM_WINDOW_MS = 60_000;

interface PeriodCounter {
  period: string;
  tokens: number;
}

interface TpmEvent {
  at: Date;
  tokens: number;
  reservationId: string;
}

interface StoredQuotaCounter {
  keyId: Types.ObjectId;
  daily: PeriodCounter;
  weekly: PeriodCounter;
  monthly: PeriodCounter;
  tpmEvents: TpmEvent[];
}

type QuotaCounterDocument = HydratedDocument<StoredQuotaCounter>;

type StoredQuotaReservation = Omit<
  QuotaReservationRecord,
  "id" | "keyId" | "memberId"
> & {
  reservationId: string;
  keyId: Types.ObjectId;
  memberId: Types.ObjectId;
};

type QuotaReservationDocument = HydratedDocument<StoredQuotaReservation>;

interface QuotaCounterState {
  daily: PeriodCounter;
  weekly: PeriodCounter;
  monthly: PeriodCounter;
  tpmEvents: TpmEvent[];
}

const periodCounterSchema = new Schema<PeriodCounter>(
  {
    period: { type: String, required: true },
    tokens: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const tpmEventSchema = new Schema<TpmEvent>(
  {
    reservationId: { type: String, required: true },
    at: { type: Date, required: true },
    tokens: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const quotaCounterSchema = new Schema<QuotaCounterDocument>(
  {
    keyId: {
      type: Schema.Types.ObjectId,
      ref: "ApiKey",
      required: true,
      immutable: true,
    },
    daily: { type: periodCounterSchema, required: true },
    weekly: { type: periodCounterSchema, required: true },
    monthly: { type: periodCounterSchema, required: true },
    tpmEvents: { type: [tpmEventSchema], required: true, default: [] },
  },
  { versionKey: false },
);

quotaCounterSchema.index(
  { keyId: 1 },
  { unique: true, name: "quota_counter_key_unique" },
);

const quotaReservationSchema = new Schema<QuotaReservationDocument>(
  {
    reservationId: { type: String, required: true },
    keyId: {
      type: Schema.Types.ObjectId,
      ref: "ApiKey",
      required: true,
      immutable: true,
    },
    memberId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    reservedTokens: { type: Number, required: true, min: 1 },
    actualTokens: { type: Number, default: null, min: 0 },
    status: {
      type: String,
      enum: ["RESERVED", "SETTLED", "CHARGED_ESTIMATE", "RELEASED"],
      required: true,
    },
    reservedAt: { type: Date, required: true, immutable: true },
    completedAt: { type: Date, default: null },
    periods: {
      daily: { type: String, required: true },
      weekly: { type: String, required: true },
      monthly: { type: String, required: true },
    },
  },
  { versionKey: false },
);

quotaReservationSchema.index(
  { reservationId: 1 },
  { unique: true, name: "quota_reservation_id_unique" },
);

quotaReservationSchema.index(
  { keyId: 1, reservedAt: -1 },
  { name: "quota_reservation_key_created_desc" },
);

quotaReservationSchema.index(
  { memberId: 1, reservedAt: -1 },
  { name: "quota_reservation_member_created_desc" },
);

const QuotaCounterModel = mongoose.model<QuotaCounterDocument>(
  "ApiKeyQuotaCounter",
  quotaCounterSchema,
);

const QuotaReservationModel = mongoose.model<QuotaReservationDocument>(
  "ApiKeyQuotaReservation",
  quotaReservationSchema,
);

function toObjectId(value: string): Types.ObjectId {
  return new Types.ObjectId(value);
}

function getUtcDateKey(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function getPeriods(date: Date): QuotaPeriods {
  const dayOfWeek = date.getUTCDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
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
  const daysUntilNextMonday = 7 - daysSinceMonday;

  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + daysUntilNextMonday,
    ),
  );
}

function nextUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

function secondsUntil(target: Date, now: Date): number {
  return Math.max(1, Math.ceil((target.getTime() - now.getTime()) / 1_000));
}

function getTpmUsage(events: TpmEvent[]): number {
  return events.reduce((total, event) => total + event.tokens, 0);
}

function getTpmRetryAfterSeconds(
  events: TpmEvent[],
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

function getLimitValues(limits: ApiKeyLimits): Record<string, number> {
  return {
    tpm: limits.tokensPerMinute,
    daily: limits.dailyTokens,
    weekly: limits.weeklyTokens,
    monthly: limits.monthlyTokens,
  };
}

function getBlockedLimits(
  state: QuotaCounterState,
  limits: ApiKeyLimits,
  reservedTokens: number,
): Array<"tpm" | "daily" | "weekly" | "monthly"> {
  const blocked: Array<"tpm" | "daily" | "weekly" | "monthly"> = [];

  if (getTpmUsage(state.tpmEvents) + reservedTokens > limits.tokensPerMinute) {
    blocked.push("tpm");
  }

  if (state.daily.tokens + reservedTokens > limits.dailyTokens) {
    blocked.push("daily");
  }

  if (state.weekly.tokens + reservedTokens > limits.weeklyTokens) {
    blocked.push("weekly");
  }

  if (state.monthly.tokens + reservedTokens > limits.monthlyTokens) {
    blocked.push("monthly");
  }

  return blocked;
}

function getRetryAfterSeconds(
  blockedLimits: Array<"tpm" | "daily" | "weekly" | "monthly">,
  state: QuotaCounterState,
  limits: ApiKeyLimits,
  reservedTokens: number,
  now: Date,
): number {
  const waits: number[] = [];

  if (blockedLimits.includes("tpm")) {
    waits.push(
      getTpmRetryAfterSeconds(
        state.tpmEvents,
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

function toReservationRecord(
  document: QuotaReservationDocument,
): QuotaReservationRecord {
  return {
    id: document.reservationId,
    keyId: document.keyId.toString(),
    memberId: document.memberId.toString(),
    reservedTokens: document.reservedTokens,
    actualTokens: document.actualTokens ?? null,
    status: document.status,
    reservedAt: document.reservedAt,
    completedAt: document.completedAt ?? null,
    periods: {
      daily: document.periods.daily,
      weekly: document.periods.weekly,
      monthly: document.periods.monthly,
    },
  };
}

function adjustPeriod(
  current: PeriodCounter,
  reservedPeriod: string,
  tokenDelta: number,
): PeriodCounter {
  if (current.period !== reservedPeriod) {
    return { ...current };
  }

  const tokens = current.tokens + tokenDelta;

  if (!Number.isSafeInteger(tokens) || tokens < 0) {
    throw new Error("Quota counter adjustment would be invalid");
  }

  return { period: current.period, tokens };
}

async function saveCounter(
  document: QuotaCounterDocument,
  session?: TransactionContext,
): Promise<void> {
  if (session) {
    await document.save({ session: session as ClientSession });
    return;
  }

  await document.save();
}

async function saveReservation(
  document: QuotaReservationDocument,
  session?: TransactionContext,
): Promise<void> {
  if (session) {
    await document.save({ session: session as ClientSession });
    return;
  }

  await document.save();
}

export class QuotaRepository implements IQuotaRepository {
  private async findCounter(
    keyId: Types.ObjectId,
    session?: TransactionContext,
  ): Promise<QuotaCounterDocument | null> {
    const query = QuotaCounterModel.findOne({ keyId });

    if (session) {
      query.session(session as ClientSession);
    }

    return query.exec();
  }

  async getCurrentUsage(params: {
    keyId: string;
    now: Date;
  }): Promise<QuotaUsageSnapshot> {
    const periods = getPeriods(params.now);
    const counter = await this.findCounter(toObjectId(params.keyId));

    if (!counter) {
      return {
        tokensPerMinute: 0,
        dailyTokens: 0,
        weeklyTokens: 0,
        monthlyTokens: 0,
        nextTpmTokenExpiryAt: null,
      };
    }

    const cutoff = params.now.getTime() - TPM_WINDOW_MS;
    const activeTpmEvents = counter.tpmEvents.filter(
      (event) => event.at.getTime() > cutoff,
    );

    const nextTpmTokenExpiryAt = activeTpmEvents.reduce<Date | null>(
      (earliestExpiry, event) => {
        const expiry = new Date(event.at.getTime() + TPM_WINDOW_MS);

        return !earliestExpiry || expiry < earliestExpiry
          ? expiry
          : earliestExpiry;
      },
      null,
    );

    return {
      tokensPerMinute: getTpmUsage(activeTpmEvents),
      dailyTokens:
        counter.daily.period === periods.daily ? counter.daily.tokens : 0,
      weeklyTokens:
        counter.weekly.period === periods.weekly ? counter.weekly.tokens : 0,
      monthlyTokens:
        counter.monthly.period === periods.monthly ? counter.monthly.tokens : 0,
      nextTpmTokenExpiryAt,
    };
  }

  private async findReservation(
    reservationId: string,
    session?: TransactionContext,
  ): Promise<QuotaReservationDocument | null> {
    const query = QuotaReservationModel.findOne({ reservationId });

    if (session) {
      query.session(session as ClientSession);
    }

    return query.exec();
  }

  async reserve(params: {
    keyId: string;
    memberId: string;
    reservationId: string;
    reservedTokens: number;
    limits: ApiKeyLimits;
    now: Date;
    session?: TransactionContext;
  }): Promise<QuotaReserveResult> {
    const existingReservation = await this.findReservation(
      params.reservationId,
      params.session,
    );

    if (existingReservation) {
      return {
        type: "RESERVED",
        reservation: toReservationRecord(existingReservation),
      };
    }

    const limitValues = getLimitValues(params.limits);
    const maximumReservationTokens = Math.min(...Object.values(limitValues));
    const exceededLimits = (
      Object.keys(limitValues) as Array<"tpm" | "daily" | "weekly" | "monthly">
    ).filter((limit) => params.reservedTokens > limitValues[limit]);

    if (exceededLimits.length > 0) {
      return {
        type: "REQUEST_TOO_LARGE",
        maximumReservationTokens,
        exceededLimits,
      };
    }

    const keyId = toObjectId(params.keyId);
    const periods = getPeriods(params.now);
    let counter = await this.findCounter(keyId, params.session);

    if (!counter) {
      counter = new QuotaCounterModel({
        keyId,
        daily: { period: periods.daily, tokens: 0 },
        weekly: { period: periods.weekly, tokens: 0 },
        monthly: { period: periods.monthly, tokens: 0 },
        tpmEvents: [],
      });
    }

    const cutoff = params.now.getTime() - TPM_WINDOW_MS;
    const state: QuotaCounterState = {
      daily:
        counter.daily.period === periods.daily
          ? { period: counter.daily.period, tokens: counter.daily.tokens }
          : { period: periods.daily, tokens: 0 },
      weekly:
        counter.weekly.period === periods.weekly
          ? { period: counter.weekly.period, tokens: counter.weekly.tokens }
          : { period: periods.weekly, tokens: 0 },
      monthly:
        counter.monthly.period === periods.monthly
          ? { period: counter.monthly.period, tokens: counter.monthly.tokens }
          : { period: periods.monthly, tokens: 0 },
      tpmEvents: counter.tpmEvents
        .filter((event) => event.at.getTime() > cutoff)
        .map((event) => ({
          reservationId: event.reservationId,
          at: event.at,
          tokens: event.tokens,
        })),
    };

    const blockedLimits = getBlockedLimits(
      state,
      params.limits,
      params.reservedTokens,
    );

    if (blockedLimits.length > 0) {
      counter.set(state);
      await saveCounter(counter, params.session);

      return {
        type: "LIMITED",
        blockedLimits,
        retryAfterSeconds: getRetryAfterSeconds(
          blockedLimits,
          state,
          params.limits,
          params.reservedTokens,
          params.now,
        ),
      };
    }

    state.daily.tokens += params.reservedTokens;
    state.weekly.tokens += params.reservedTokens;
    state.monthly.tokens += params.reservedTokens;
    state.tpmEvents.push({
      reservationId: params.reservationId,
      at: params.now,
      tokens: params.reservedTokens,
    });

    counter.set(state);
    await saveCounter(counter, params.session);

    const reservation = new QuotaReservationModel({
      reservationId: params.reservationId,
      keyId,
      memberId: toObjectId(params.memberId),
      reservedTokens: params.reservedTokens,
      actualTokens: null,
      status: "RESERVED",
      reservedAt: params.now,
      completedAt: null,
      periods,
    });

    await saveReservation(reservation, params.session);

    return {
      type: "RESERVED",
      reservation: toReservationRecord(reservation),
    };
  }

  async completeWithUsage(params: {
    reservationId: string;
    actualTokens: number;
    completedAt: Date;
    session?: TransactionContext;
  }): Promise<QuotaReservationRecord | null> {
    const reservation = await this.findReservation(
      params.reservationId,
      params.session,
    );

    if (!reservation) {
      return null;
    }

    if (reservation.status !== "RESERVED") {
      return toReservationRecord(reservation);
    }

    const keyId = reservation.keyId;
    const counter = await this.findCounter(keyId, params.session);

    if (!counter) {
      throw new Error("Quota counter is missing for a reservation");
    }

    const cutoff = params.completedAt.getTime() - TPM_WINDOW_MS;
    const tokenDelta = params.actualTokens - reservation.reservedTokens;
    const tpmEvents = counter.tpmEvents
      .filter((event) => event.at.getTime() > cutoff)
      .map((event) =>
        event.reservationId === params.reservationId
          ? { ...event, tokens: params.actualTokens }
          : {
              at: event.at,
              tokens: event.tokens,
              reservationId: event.reservationId,
            },
      )
      .filter((event) => event.tokens > 0);

    counter.set({
      daily: adjustPeriod(counter.daily, reservation.periods.daily, tokenDelta),
      weekly: adjustPeriod(
        counter.weekly,
        reservation.periods.weekly,
        tokenDelta,
      ),
      monthly: adjustPeriod(
        counter.monthly,
        reservation.periods.monthly,
        tokenDelta,
      ),
      tpmEvents,
    });

    await saveCounter(counter, params.session);

    reservation.actualTokens = params.actualTokens;
    reservation.status = "SETTLED";
    reservation.completedAt = params.completedAt;
    await saveReservation(reservation, params.session);

    return toReservationRecord(reservation);
  }

  async completeWithoutUsage(params: {
    reservationId: string;
    completedAt: Date;
    session?: TransactionContext;
  }): Promise<QuotaReservationRecord | null> {
    const reservation = await this.findReservation(
      params.reservationId,
      params.session,
    );

    if (!reservation) {
      return null;
    }

    if (reservation.status !== "RESERVED") {
      return toReservationRecord(reservation);
    }

    reservation.status = "CHARGED_ESTIMATE";
    reservation.completedAt = params.completedAt;
    await saveReservation(reservation, params.session);

    return toReservationRecord(reservation);
  }

  async releaseBeforeUpstream(params: {
    reservationId: string;
    completedAt: Date;
    session?: TransactionContext;
  }): Promise<boolean> {
    const reservation = await this.findReservation(
      params.reservationId,
      params.session,
    );

    if (!reservation || reservation.status !== "RESERVED") {
      return false;
    }

    const counter = await this.findCounter(reservation.keyId, params.session);

    if (!counter) {
      throw new Error("Quota counter is missing for a reservation");
    }

    const state: QuotaCounterState = {
      daily: adjustPeriod(
        counter.daily,
        reservation.periods.daily,
        -reservation.reservedTokens,
      ),
      weekly: adjustPeriod(
        counter.weekly,
        reservation.periods.weekly,
        -reservation.reservedTokens,
      ),
      monthly: adjustPeriod(
        counter.monthly,
        reservation.periods.monthly,
        -reservation.reservedTokens,
      ),
      tpmEvents: counter.tpmEvents.filter(
        (event) => event.reservationId !== params.reservationId,
      ),
    };

    counter.set(state);
    await saveCounter(counter, params.session);

    reservation.status = "RELEASED";
    reservation.completedAt = params.completedAt;
    await saveReservation(reservation, params.session);

    return true;
  }
}
