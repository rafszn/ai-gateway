import type {
  UsageStatus,
  UsageRecord,
  NewUsageRecord,
  UsageFinalization,
  TransactionContext,
} from "./usage.types.js";
import mongoose, { Schema, Types } from "mongoose";
import type { IUsageRepository } from "./usage.repository.js";
import type { ClientSession, HydratedDocument } from "mongoose";

type StoredUsageRecord = Omit<UsageRecord, "id" | "memberId" | "keyId"> & {
  keyId: Types.ObjectId;
  memberId: Types.ObjectId;
};

type UsageDocument = HydratedDocument<StoredUsageRecord>;

const usageSchema = new Schema<StoredUsageRecord>(
  {
    memberId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    keyId: {
      type: Schema.Types.ObjectId,
      ref: "ApiKey",
      required: true,
      immutable: true,
    },
    model: {
      type: String,
      default: null,
      maxlength: 200,
    },
    quotaReservationId: {
      type: String,
      default: null,
    },
    inputTokens: {
      type: Number,
      default: null,
      min: 0,
    },
    outputTokens: {
      type: Number,
      default: null,
      min: 0,
    },
    totalTokens: {
      type: Number,
      default: null,
      min: 0,
    },
    status: {
      type: String,
      enum: ["PENDING", "SUCCEEDED", "FAILED", "REJECTED", "INTERRUPTED"],
      required: true,
    },
    httpStatus: {
      type: Number,
      default: null,
      min: 100,
      max: 599,
    },
    latencyMs: {
      type: Number,
      default: null,
      min: 0,
    },
    requestedAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { versionKey: false },
);

usageSchema.index(
  { keyId: 1, requestedAt: -1, _id: -1 },
  { name: "usage_key_requested_desc" },
);

usageSchema.index(
  { memberId: 1, requestedAt: -1, _id: -1 },
  { name: "usage_member_requested_desc" },
);

usageSchema.index(
  { status: 1, requestedAt: 1 },
  { name: "usage_status_requested_asc" },
);

const UsageModel = mongoose.model<StoredUsageRecord>("ApiKeyUsage", usageSchema);

function toObjectId(value: string): Types.ObjectId {
  return new Types.ObjectId(value);
}

function toUsageRecord(document: UsageDocument): UsageRecord {
  return {
    id: document._id.toString(),
    memberId: document.memberId.toString(),
    keyId: document.keyId.toString(),
    model: document.model ?? null,
    quotaReservationId: document.quotaReservationId ?? null,
    inputTokens: document.inputTokens ?? null,
    outputTokens: document.outputTokens ?? null,
    totalTokens: document.totalTokens ?? null,
    status: document.status as UsageStatus,
    httpStatus: document.httpStatus ?? null,
    latencyMs: document.latencyMs ?? null,
    requestedAt: document.requestedAt,
    completedAt: document.completedAt ?? null,
  };
}

function sessionOptions(session?: TransactionContext) {
  return session ? { session: session as ClientSession } : {};
}

export class UsageRepository implements IUsageRepository {
  async create(params: {
    record: NewUsageRecord;
    session?: TransactionContext;
  }): Promise<UsageRecord> {
    const document = new UsageModel({
      ...params.record,
      memberId: toObjectId(params.record.memberId),
      keyId: toObjectId(params.record.keyId),
    });

    if (params.session) {
      await document.save({ session: params.session as ClientSession });
    } else {
      await document.save();
    }

    return toUsageRecord(document);
  }

  async finalize(params: {
    changes: UsageFinalization;
    session?: TransactionContext;
  }): Promise<UsageRecord | null> {
    const document = await UsageModel.findOneAndUpdate(
      {
        _id: toObjectId(params.changes.usageId),
        status: "PENDING",
      },
      {
        $set: {
          status: params.changes.status,
          latencyMs: params.changes.latencyMs,
          httpStatus: params.changes.httpStatus,
          completedAt: params.changes.completedAt,
          inputTokens: params.changes.inputTokens,
          totalTokens: params.changes.totalTokens,
          outputTokens: params.changes.outputTokens,
          quotaReservationId: params.changes.quotaReservationId,
        },
      },
      {
        returnDocument: "after",
        runValidators: true,
        ...sessionOptions(params.session),
      },
    ).exec();

    return document ? toUsageRecord(document) : null;
  }
}
