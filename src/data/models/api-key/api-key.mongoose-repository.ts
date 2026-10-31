import type {
  ApiKeyRecord,
  NewApiKeyRecord,
  ApiKeyLimitChanges,
  TransactionContext,
} from "./api-key.types.js";
import mongoose, { Schema, Types } from "mongoose";
import type { ClientSession, HydratedDocument } from "mongoose";
import type { IApiKeyRepository } from "./api-key.repository.js";

type StoredApiKeyRecord = Omit<
  ApiKeyRecord,
  | "id"
  | "memberId"
  | "createdByAdminId"
  | "revokedByAdminId"
  | "lastReactivatedByAdminId"
> & {
  secretHash: string;
  nameNormalized: string;
  memberId: Types.ObjectId;
  createdByAdminId: Types.ObjectId;
  revokedByAdminId: Types.ObjectId | null;
  lastReactivatedByAdminId: Types.ObjectId | null;
};

type ApiKeyDocument = HydratedDocument<StoredApiKeyRecord>;

const modelIdPattern = /^gpt-[a-z0-9]+(?:[.-][a-z0-9]+)*-1$/;

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function toObjectId(value: string): Types.ObjectId {
  return new Types.ObjectId(value);
}

function toNullableObjectId(value: string | null): Types.ObjectId | null {
  return value === null ? null : toObjectId(value);
}

const apiKeySchema = new Schema<ApiKeyDocument>(
  {
    memberId: {
      ref: "User",
      required: true,
      immutable: true,
      type: Schema.Types.ObjectId,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    nameNormalized: {
      type: String,
      required: true,
      select: false,
    },
    secretHash: {
      type: String,
      required: true,
      immutable: true,
      select: false,
    },
    keyPrefix: {
      type: String,
      required: true,
      immutable: true,
    },
    models: {
      type: [String],
      required: true,
      validate: {
        validator: (models: string[]) =>
          Array.isArray(models) &&
          models.length > 0 &&
          models.every((model) => modelIdPattern.test(model)),
        message: "At least one valid GPT deployment model is required",
      },
    },
    limits: {
      tokensPerMinute: {
        type: Number,
        required: true,
        min: 1,
        validate: isPositiveSafeInteger,
      },
      dailyTokens: {
        type: Number,
        required: true,
        min: 1,
        validate: isPositiveSafeInteger,
      },
      weeklyTokens: {
        type: Number,
        required: true,
        min: 1,
        validate: isPositiveSafeInteger,
      },
      monthlyTokens: {
        type: Number,
        required: true,
        min: 1,
        validate: isPositiveSafeInteger,
      },
    },
    status: {
      type: String,
      enum: ["ACTIVE", "EXPIRED", "REVOKED"],
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    activatedAt: {
      type: Date,
      required: true,
    },
    createdByAdminId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      immutable: true,
    },
    lastReactivatedAt: {
      type: Date,
      default: null,
    },
    lastReactivatedByAdminId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    revokedByAdminId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  { timestamps: true },
);

apiKeySchema.index(
  { secretHash: 1 },
  { unique: true, name: "api_key_secret_hash_unique" },
);

apiKeySchema.index(
  { memberId: 1, nameNormalized: 1 },
  { unique: true, name: "api_key_member_name_unique" },
);

apiKeySchema.index(
  { memberId: 1, createdAt: -1, _id: -1 },
  { name: "api_key_member_created_desc" },
);

apiKeySchema.index(
  { status: 1, expiresAt: 1 },
  { name: "api_key_status_expiry" },
);

const ApiKeyModel = mongoose.model<ApiKeyDocument>("ApiKey", apiKeySchema);

function toApiKeyRecord(document: ApiKeyDocument): ApiKeyRecord {
  return {
    id: document._id.toString(),
    memberId: document.memberId.toString(),
    name: document.name,
    keyPrefix: document.keyPrefix,
    models: [...document.models],
    limits: {
      tokensPerMinute: document.limits.tokensPerMinute,
      dailyTokens: document.limits.dailyTokens,
      weeklyTokens: document.limits.weeklyTokens,
      monthlyTokens: document.limits.monthlyTokens,
    },
    status: document.status,
    expiresAt: document.expiresAt,
    activatedAt: document.activatedAt,
    createdByAdminId: document.createdByAdminId.toString(),
    lastReactivatedAt: document.lastReactivatedAt ?? null,
    lastReactivatedByAdminId:
      document.lastReactivatedByAdminId?.toString() ?? null,
    revokedAt: document.revokedAt ?? null,
    revokedByAdminId: document.revokedByAdminId?.toString() ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

function sessionOptions(session?: TransactionContext) {
  return session ? { session: session as ClientSession } : {};
}

function updateOptions(session?: TransactionContext) {
  return {
    returnDocument: "after" as const,
    runValidators: true,
    ...sessionOptions(session),
  };
}

export class ApiKeyRepository implements IApiKeyRepository {
  async findById(params: {
    memberId: string;
    keyId: string;
  }): Promise<ApiKeyRecord | null> {
    const document = await ApiKeyModel.findOne({
      _id: toObjectId(params.keyId),
      memberId: toObjectId(params.memberId),
    }).exec();

    return document ? toApiKeyRecord(document) : null;
  }

  async findBySecretHash(secretHash: string): Promise<ApiKeyRecord | null> {
    const document = await ApiKeyModel.findOne({ secretHash }).exec();

    return document ? toApiKeyRecord(document) : null;
  }

  async listByMemberId(params: {
    memberId: string;
    offset: number;
    limit: number;
  }): Promise<{
    items: ApiKeyRecord[];
    total: number;
  }> {
    const memberId = toObjectId(params.memberId);
    const [documents, total] = await Promise.all([
      ApiKeyModel.find({ memberId })
        .sort({ createdAt: -1, _id: -1 })
        .skip(params.offset)
        .limit(params.limit)
        .exec(),
      ApiKeyModel.countDocuments({ memberId }).exec(),
    ]);

    return {
      items: documents.map(toApiKeyRecord),
      total,
    };
  }

  async create(params: {
    record: NewApiKeyRecord;
    session?: TransactionContext;
  }): Promise<ApiKeyRecord> {
    const record = params.record;
    const document = new ApiKeyModel({
      ...record,
      memberId: toObjectId(record.memberId),
      createdByAdminId: toObjectId(record.createdByAdminId),
      lastReactivatedByAdminId: toNullableObjectId(
        record.lastReactivatedByAdminId,
      ),
      revokedByAdminId: toNullableObjectId(record.revokedByAdminId),
    });
    const session = params.session as ClientSession | undefined;

    if (session) {
      await document.save({ session });
    } else {
      await document.save();
    }

    return toApiKeyRecord(document);
  }

  async updateName(params: {
    memberId: string;
    keyId: string;
    name: string;
    nameNormalized: string;
    session?: TransactionContext;
  }): Promise<ApiKeyRecord | null> {
    const document = await ApiKeyModel.findOneAndUpdate(
      {
        _id: toObjectId(params.keyId),
        memberId: toObjectId(params.memberId),
      },
      {
        $set: {
          name: params.name,
          nameNormalized: params.nameNormalized,
        },
      },
      updateOptions(params.session),
    ).exec();

    return document ? toApiKeyRecord(document) : null;
  }

  async replaceModels(params: {
    memberId: string;
    keyId: string;
    models: string[];
    session?: TransactionContext;
  }): Promise<ApiKeyRecord | null> {
    const document = await ApiKeyModel.findOneAndUpdate(
      {
        _id: toObjectId(params.keyId),
        memberId: toObjectId(params.memberId),
      },
      { $set: { models: params.models } },
      updateOptions(params.session),
    ).exec();

    return document ? toApiKeyRecord(document) : null;
  }

  async updateLimits(params: {
    memberId: string;
    keyId: string;
    changes: ApiKeyLimitChanges;
    session?: TransactionContext;
  }): Promise<ApiKeyRecord | null> {
    const set: Record<string, number> = {};

    for (const field of Object.keys(
      params.changes,
    ) as (keyof ApiKeyLimitChanges)[]) {
      const value = params.changes[field];

      if (value !== undefined) {
        set[`limits.${field}`] = value;
      }
    }

    if (Object.keys(set).length === 0) {
      return null;
    }

    const document = await ApiKeyModel.findOneAndUpdate(
      {
        _id: toObjectId(params.keyId),
        memberId: toObjectId(params.memberId),
      },
      { $set: set },
      updateOptions(params.session),
    ).exec();

    return document ? toApiKeyRecord(document) : null;
  }

  async revoke(params: {
    memberId: string;
    keyId: string;
    revokedAt: Date;
    revokedByAdminId: string;
    session?: TransactionContext;
  }): Promise<ApiKeyRecord | null> {
    const document = await ApiKeyModel.findOneAndUpdate(
      {
        _id: toObjectId(params.keyId),
        memberId: toObjectId(params.memberId),
        status: { $ne: "REVOKED" },
      },
      {
        $set: {
          status: "REVOKED",
          revokedAt: params.revokedAt,
          revokedByAdminId: toObjectId(params.revokedByAdminId),
        },
      },
      updateOptions(params.session),
    ).exec();

    return document ? toApiKeyRecord(document) : null;
  }

  async revokeAllByMemberId(params: {
    memberId: string;
    revokedAt: Date;
    revokedByAdminId: string;
    session?: TransactionContext;
  }): Promise<number> {
    const query = ApiKeyModel.updateMany(
      {
        memberId: toObjectId(params.memberId),
        status: { $ne: "REVOKED" },
      },
      {
        $set: {
          status: "REVOKED",
          revokedAt: params.revokedAt,
          revokedByAdminId: toObjectId(params.revokedByAdminId),
        },
      },
    );

    if (params.session) {
      query.session(params.session as ClientSession);
    }

    const result = await query.exec();
    return result.modifiedCount;
  }

  async reactivate(params: {
    memberId: string;
    keyId: string;
    activatedAt: Date;
    expiresAt: Date;
    reactivatedByAdminId: string;
    session?: TransactionContext;
  }): Promise<ApiKeyRecord | null> {
    const document = await ApiKeyModel.findOneAndUpdate(
      {
        _id: toObjectId(params.keyId),
        memberId: toObjectId(params.memberId),
        status: { $ne: "REVOKED" },
        expiresAt: { $lte: params.activatedAt },
      },
      {
        $set: {
          status: "ACTIVE",
          activatedAt: params.activatedAt,
          expiresAt: params.expiresAt,
          lastReactivatedAt: params.activatedAt,
          lastReactivatedByAdminId: toObjectId(params.reactivatedByAdminId),
          revokedAt: null,
          revokedByAdminId: null,
        },
      },
      updateOptions(params.session),
    ).exec();

    return document ? toApiKeyRecord(document) : null;
  }

  async expireDue(params: {
    now: Date;
    session?: TransactionContext;
  }): Promise<number> {
    const query = ApiKeyModel.updateMany(
      {
        status: "ACTIVE",
        expiresAt: { $lte: params.now },
      },
      { $set: { status: "EXPIRED" } },
    );

    if (params.session) {
      query.session(params.session as ClientSession);
    }

    const result = await query.exec();
    return result.modifiedCount;
  }

  async deleteById(params: {
    memberId: string;
    keyId: string;
    session?: TransactionContext;
  }): Promise<boolean> {
    const query = ApiKeyModel.deleteOne({
      _id: toObjectId(params.keyId),
      memberId: toObjectId(params.memberId),
    });

    if (params.session) {
      query.session(params.session as ClientSession);
    }

    const result = await query.exec();
    return result.deletedCount === 1;
  }
}
