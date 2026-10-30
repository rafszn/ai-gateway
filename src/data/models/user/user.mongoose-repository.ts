import { IUserRepository } from "./user.repository.js";
import mongoose, { Schema, HydratedDocument, ClientSession } from "mongoose";
import { UserRecord, NewUserRecord, TransactionContext } from "./user.types.js";

type UserDocument = HydratedDocument<Omit<UserRecord, "id">>;

const userSchema = new Schema<UserDocument>(
  {
    username: {
      type: String,
      required: true,
      unique: true,
    },
    firstName: {
      type: String,
    },
    lastName: {
      type: String,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
    },
    phoneNumber: {
      type: String,
    },
    state: {
      type: String,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    emailToken: {
      type: String,
      default: null,
    },
    resetPasswordToken: {
      type: String,
      default: null,
    },
    resetPasswordExpiry: {
      type: Date,
      default: null,
    },
    authProvider: {
      type: String,
      enum: ["local", "google"],
      default: "local",
    },
  },
  { timestamps: true },
);

const UserModel = mongoose.model<UserDocument>("User", userSchema);

function toUserRecord(doc: UserDocument): UserRecord {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id, __v, ...rest } = doc.toObject();

  return {
    id: _id.toString(),
    ...rest,
  } as UserRecord;
}

export class UserRepository implements IUserRepository {
  async create(params: {
    record: NewUserRecord;
    session?: TransactionContext;
  }): Promise<UserRecord> {
    const [doc] = await UserModel.create(
      [
        {
          ...params.record,
        },
      ],
      {
        session: params.session as ClientSession | undefined,
      },
    );

    return toUserRecord(doc);
  }
}
