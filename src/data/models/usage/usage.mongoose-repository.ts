import type {
  UsageStatus,
  UsageRecord,
  NewUsageRecord,
  UsageFinalization,
  TransactionContext,
  UsageMonthlySummary,
} from "./usage.types.js";
import mongoose, { Schema, Types } from "mongoose";
import type { IUsageRepository } from "./usage.repository.js";
import type { ClientSession, HydratedDocument } from "mongoose";

type StoredUsageRecord = Omit<UsageRecord, "id" | "memberId" | "keyId"> & {
  keyId: Types.ObjectId;
  memberId: Types.ObjectId;
};

type UsageDocument = HydratedDocument<StoredUsageRecord>;

interface UsageSummaryFacet {
  totals: Array<{
    requestCount: number;
    pendingRequests: number;
    succeededRequests: number;
    failedRequests: number;
    rejectedRequests: number;
    interruptedRequests: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    averageLatencyMs: number | null;
  }>;
  byModel: Array<{
    _id: string | null;
    requestCount: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }>;
  recentRequests: UsageMonthlySummary["recentRequests"];
}

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

const UsageModel = mongoose.model<StoredUsageRecord>(
  "ApiKeyUsage",
  usageSchema,
);

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

  async getMonthlySummary(params: {
    keyId: string;
    from: Date;
    to: Date;
  }): Promise<UsageMonthlySummary> {
    const [result] = await UsageModel.aggregate<UsageSummaryFacet>([
      {
        $match: {
          keyId: toObjectId(params.keyId),
          requestedAt: {
            $gte: params.from,
            $lt: params.to,
          },
        },
      },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                requestCount: { $sum: 1 },
                pendingRequests: {
                  $sum: { $cond: [{ $eq: ["$status", "PENDING"] }, 1, 0] },
                },
                succeededRequests: {
                  $sum: { $cond: [{ $eq: ["$status", "SUCCEEDED"] }, 1, 0] },
                },
                failedRequests: {
                  $sum: { $cond: [{ $eq: ["$status", "FAILED"] }, 1, 0] },
                },
                rejectedRequests: {
                  $sum: { $cond: [{ $eq: ["$status", "REJECTED"] }, 1, 0] },
                },
                interruptedRequests: {
                  $sum: {
                    $cond: [{ $eq: ["$status", "INTERRUPTED"] }, 1, 0],
                  },
                },
                inputTokens: {
                  $sum: { $ifNull: ["$inputTokens", 0] },
                },
                outputTokens: {
                  $sum: { $ifNull: ["$outputTokens", 0] },
                },
                totalTokens: {
                  $sum: { $ifNull: ["$totalTokens", 0] },
                },
                averageLatencyMs: { $avg: "$latencyMs" },
              },
            },
          ],
          byModel: [
            {
              $group: {
                _id: "$model",
                requestCount: { $sum: 1 },
                inputTokens: {
                  $sum: { $ifNull: ["$inputTokens", 0] },
                },
                outputTokens: {
                  $sum: { $ifNull: ["$outputTokens", 0] },
                },
                totalTokens: {
                  $sum: { $ifNull: ["$totalTokens", 0] },
                },
              },
            },
            {
              $sort: {
                totalTokens: -1,
                requestCount: -1,
              },
            },
          ],
          recentRequests: [
            { $sort: { requestedAt: -1, _id: -1 } },
            { $limit: 20 },
            {
              $project: {
                _id: 0,
                requestedAt: 1,
                model: 1,
                status: 1,
                httpStatus: 1,
                inputTokens: 1,
                outputTokens: 1,
                totalTokens: 1,
                latencyMs: 1,
              },
            },
          ],
        },
      },
    ]).exec();

    const totals = result?.totals[0];

    return {
      requestCount: totals?.requestCount ?? 0,
      statusCounts: {
        pending: totals?.pendingRequests ?? 0,
        succeeded: totals?.succeededRequests ?? 0,
        failed: totals?.failedRequests ?? 0,
        rejected: totals?.rejectedRequests ?? 0,
        interrupted: totals?.interruptedRequests ?? 0,
      },
      foundryReportedTokens: {
        inputTokens: totals?.inputTokens ?? 0,
        outputTokens: totals?.outputTokens ?? 0,
        totalTokens: totals?.totalTokens ?? 0,
      },
      averageLatencyMs:
        totals?.averageLatencyMs == null
          ? null
          : Math.round(totals.averageLatencyMs),
      byModel: (result?.byModel ?? []).map((item) => ({
        model: item._id,
        requestCount: item.requestCount,
        inputTokens: item.inputTokens,
        outputTokens: item.outputTokens,
        totalTokens: item.totalTokens,
      })),
      recentRequests: result?.recentRequests ?? [],
    };
  }
}
