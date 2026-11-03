import type {
  QuotaTpmEvent,
  QuotaCounterRecord,
  QuotaPeriodCounter,
} from "./quota.types.js";
import mongoose, { Schema, Types } from "mongoose";
import type { IQuotaRepository } from "./quota.repository.js";
import type { ClientSession, HydratedDocument } from "mongoose";

interface StoredQuotaCounter extends Omit<QuotaCounterRecord, "keyId"> {
  keyId: Types.ObjectId;
}

type QuotaCounterDocument = HydratedDocument<StoredQuotaCounter>;

const periodCounterSchema = new Schema<QuotaPeriodCounter>(
  {
    period: { type: String, required: true },
    tokens: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const tpmEventSchema = new Schema<QuotaTpmEvent>(
  {
    at: { type: Date, required: true },
    reservationId: { type: String, required: true },
    tokens: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const quotaCounterSchema = new Schema<StoredQuotaCounter>(
  {
    keyId: {
      ref: "ApiKey",
      required: true,
      immutable: true,
      type: Schema.Types.ObjectId,
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

const QuotaCounterModel = mongoose.model<StoredQuotaCounter>(
  "ApiKeyQuotaCounter",
  quotaCounterSchema,
);

function toObjectId(value: string): Types.ObjectId {
  return new Types.ObjectId(value);
}

function toCounterRecord(document: QuotaCounterDocument): QuotaCounterRecord {
  return {
    keyId: document.keyId.toString(),
    daily: {
      period: document.daily.period,
      tokens: document.daily.tokens,
    },
    weekly: {
      period: document.weekly.period,
      tokens: document.weekly.tokens,
    },
    monthly: {
      period: document.monthly.period,
      tokens: document.monthly.tokens,
    },
    tpmEvents: document.tpmEvents.map((event) => ({
      reservationId: event.reservationId,
      at: new Date(event.at.getTime()),
      tokens: event.tokens,
    })),
  };
}

export class QuotaRepository implements IQuotaRepository {
  async findCounterByKeyId(keyId: string): Promise<QuotaCounterRecord | null> {
    const document = await QuotaCounterModel.findOne({
      keyId: toObjectId(keyId),
    }).exec();

    return document ? toCounterRecord(document) : null;
  }

  async upsertCounters(params: {
    counters: QuotaCounterRecord[];
    session?: unknown;
  }): Promise<void> {
    if (params.counters.length === 0) {
      return;
    }

    const operations = params.counters.map((counter) => {
      const keyId = toObjectId(counter.keyId);

      return {
        updateOne: {
          filter: { keyId },
          update: {
            $set: {
              daily: counter.daily,
              weekly: counter.weekly,
              monthly: counter.monthly,
              tpmEvents: counter.tpmEvents,
            },
            $setOnInsert: { keyId },
          },
          upsert: true,
        },
      };
    });

    const options: { ordered: boolean; session?: ClientSession } = {
      ordered: false,
    };

    if (params.session) {
      options.session = params.session as ClientSession;
    }

    await QuotaCounterModel.bulkWrite(operations, options);
  }
}
