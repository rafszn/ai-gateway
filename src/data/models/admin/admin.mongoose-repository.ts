import mongoose, { Schema } from "mongoose";
import type {
  AdminRole,
  AdminRecord,
  NewAdminRecord,
  AdminRoleRecord,
  TransactionContext,
} from "./admin.types.js";
import type { IAdminRepository } from "./admin.repository.js";
import type { ClientSession, HydratedDocument } from "mongoose";

type AdminDocument = HydratedDocument<Omit<AdminRecord, "id">>;
type AdminRoleDocument = HydratedDocument<AdminRoleRecord>;

const adminSchema = new Schema<AdminDocument>(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    role: {
      type: String,
      enum: ["SUPER_ADMIN", "ADMIN"],
      required: true,
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
);

adminSchema.index(
  { username: 1 },
  { unique: true, name: "admin_username_unique" },
);

const adminRoleSchema = new Schema<AdminRoleDocument>(
  {
    name: {
      type: String,
      enum: ["SUPER_ADMIN", "ADMIN"],
      required: true,
    },
    permissions: {
      type: [String],
      required: true,
      default: [],
    },
  },
  { versionKey: false },
);

adminRoleSchema.index(
  { name: 1 },
  { unique: true, name: "admin_role_name_unique" },
);

const AdminModel = mongoose.model<AdminDocument>("Admin", adminSchema);

const AdminRoleModel = mongoose.model<AdminRoleDocument>(
  "AdminRole",
  adminRoleSchema,
);

function toAdminRecord(document: AdminDocument): AdminRecord {
  return {
    id: document._id.toString(),
    username: document.username,
    isActive: document.isActive,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    role: document.role as AdminRole,
    passwordHash: document.passwordHash,
  };
}

function toAdminRoleRecord(document: AdminRoleDocument): AdminRoleRecord {
  return {
    name: document.name as AdminRole,
    permissions: document.permissions,
  };
}

export class AdminRepository implements IAdminRepository {
  async findByUsername(username: string): Promise<AdminRecord | null> {
    const document = await AdminModel.findOne({ username }).exec();
    return document ? toAdminRecord(document) : null;
  }

  async findById(id: string): Promise<AdminRecord | null> {
    const document = await AdminModel.findById(id).exec();
    return document ? toAdminRecord(document) : null;
  }

  async findRoleByName(name: AdminRole): Promise<AdminRoleRecord | null> {
    const document = await AdminRoleModel.findOne({ name }).exec();
    return document ? toAdminRoleRecord(document) : null;
  }

  async create(params: {
    record: NewAdminRecord;
    session?: TransactionContext;
  }): Promise<AdminRecord> {
    const document = new AdminModel(params.record);

    await document.save({
      session: params.session as ClientSession | undefined,
    });

    return toAdminRecord(document);
  }

  async upsertRole(params: {
    record: AdminRoleRecord;
    session?: TransactionContext;
  }): Promise<AdminRoleRecord> {
    const document = await AdminRoleModel.findOneAndUpdate(
      { name: params.record.name },
      { $set: { permissions: params.record.permissions } },
      {
        upsert: true,
        returnDocument: "after",
        setDefaultsOnInsert: true,
        session: params.session as ClientSession | undefined,
      },
    ).exec();

    if (!document) {
      throw new Error(`Could not save the ${params.record.name} role`);
    }

    return toAdminRoleRecord(document);
  }
}
