import type {
  UserRecord,
  NewUserRecord,
  UpdateUserRecord,
  TransactionContext,
} from "./user.types.js";
import mongoose, { Schema } from "mongoose";
import type { IUserRepository } from "./user.repository.js";
import type { ClientSession, HydratedDocument } from "mongoose";

type UserDocument = HydratedDocument<Omit<UserRecord, "id">>;

const userSchema = new Schema<UserDocument>(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    firstName: {
      type: String,
      trim: true,
      default: null,
    },
    lastName: {
      type: String,
      trim: true,
      default: null,
    },
    phoneNumber: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { timestamps: true },
);

userSchema.index(
  { username: 1 },
  { unique: true, name: "user_username_unique" },
);

userSchema.index({ email: 1 }, { unique: true, name: "user_email_unique" });

userSchema.index(
  { createdAt: -1, _id: -1 },
  { name: "user_created_at_id_desc" },
);

const UserModel = mongoose.model<UserDocument>("User", userSchema);

function toUserRecord(document: UserDocument): UserRecord {
  return {
    email: document.email,
    id: document._id.toString(),
    username: document.username,
    updatedAt: document.updatedAt,
    createdAt: document.createdAt,
    lastName: document.lastName ?? null,
    firstName: document.firstName ?? null,
    phoneNumber: document.phoneNumber ?? null,
  };
}

export class UserRepository implements IUserRepository {
  async findById(id: string): Promise<UserRecord | null> {
    const document = await UserModel.findById(id).exec();
    return document ? toUserRecord(document) : null;
  }

  async list(params: { offset: number; limit: number }): Promise<{
    items: UserRecord[];
    total: number;
  }> {
    const [documents, total] = await Promise.all([
      UserModel.find()
        .sort({ createdAt: -1, _id: -1 })
        .skip(params.offset)
        .limit(params.limit)
        .exec(),
      UserModel.countDocuments().exec(),
    ]);

    return {
      items: documents.map(toUserRecord),
      total,
    };
  }

  async create(params: {
    record: NewUserRecord;
    session?: TransactionContext;
  }): Promise<UserRecord> {
    const document = new UserModel(params.record);
    const session = params.session as ClientSession | undefined;

    if (session) {
      await document.save({ session });
    } else {
      await document.save();
    }

    return toUserRecord(document);
  }

  async update(params: {
    id: string;
    changes: UpdateUserRecord;
    session?: TransactionContext;
  }): Promise<UserRecord | null> {
    const session = params.session as ClientSession | undefined;

    const document = await UserModel.findByIdAndUpdate(
      params.id,
      { $set: params.changes },
      {
        returnDocument: "after",
        runValidators: true,
        ...(session ? { session } : {}),
      },
    ).exec();

    return document ? toUserRecord(document) : null;
  }

  async deleteById(params: {
    id: string;
    session?: TransactionContext;
  }): Promise<UserRecord | null> {
    const query = UserModel.findByIdAndDelete(params.id);

    if (params.session) {
      query.session(params.session as ClientSession);
    }

    const document = await query.exec();
    return document ? toUserRecord(document) : null;
  }
}
