import argon2 from "argon2";
import jwt from "jsonwebtoken";
import type {
  AdminRecord,
  IAdminRepository,
} from "../../../data/models/admin/index.js";
import cfg from "../../../global/environment.config.js";
import { HOUR } from "../../../global/constants/time.js";
import { container, inject, injectable } from "tsyringe";
import { IOCTokens } from "../../../global/constants/ioc-tokens.js";
import { AppError } from "../../../global/middlewares/error-handler.js";
import { ADMIN_PERMISSIONS, type AdminPermission } from "./permissions.js";

const TOKEN_TTL_SECONDS = 2 * HOUR;

function toPublicAdmin(admin: AdminRecord) {
  return {
    id: admin.id,
    role: admin.role,
    isActive: admin.isActive,
    username: admin.username,
    createdAt: admin.createdAt,
    updatedAt: admin.updatedAt,
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

@injectable()
class AdminService {
  constructor(
    @inject(IOCTokens.AdminRepository)
    private readonly admins: IAdminRepository,
  ) {}

  async login(params: { username: string; password: string }) {
    const admin = await this.admins.findByUsername(params.username);

    if (
      !admin ||
      !admin.isActive ||
      !(await argon2.verify(admin.passwordHash, params.password))
    ) {
      throw new AppError("Invalid username or password", 401);
    }

    const accessToken = jwt.sign({ sub: admin.id }, cfg.ADMIN_JWT_SECRET, {
      expiresIn: "2h",
    });

    return {
      accessToken,
      tokenType: "Bearer" as const,
      expiresIn: TOKEN_TTL_SECONDS,
      admin: toPublicAdmin(admin),
    };
  }

  async resolvePrincipal(adminId: string) {
    const admin = await this.admins.findById(adminId);

    if (!admin || !admin.isActive) {
      return null;
    }

    const role = await this.admins.findRoleByName(admin.role);

    if (!role) {
      throw new AppError("Admin role is not configured", 500);
    }

    const permissions = role.permissions.filter(
      (permission): permission is AdminPermission =>
        ADMIN_PERMISSIONS.includes(permission as AdminPermission),
    );

    return {
      permissions,
      id: admin.id,
      role: admin.role,
      username: admin.username,
    };
  }

  async createAdmin(params: { username: string; password: string }) {
    try {
      const admin = await this.admins.create({
        record: {
          username: params.username,
          passwordHash: await argon2.hash(params.password),
          role: "ADMIN",
          isActive: true,
        },
      });

      return toPublicAdmin(admin);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new AppError("Username already exists", 409);
      }

      throw error;
    }
  }
}

const adminService = container.resolve(AdminService);
export default adminService;
