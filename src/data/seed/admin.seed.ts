import argon2 from "argon2";
import { container } from "tsyringe";
import cfg from "../../global/environment.config.js";
import { IAdminRepository } from "../models/admin/index.js";
import type { AdminRole } from "../models/admin/admin.types.js";
import { IOCTokens } from "../../global/constants/ioc-tokens.js";
import { ADMIN_ROLE_PERMISSIONS } from "../../core/Modules/Admins/permissions.js";

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

export async function seedAdminAccess(): Promise<void> {
  const repository = container.resolve<IAdminRepository>(
    IOCTokens.AdminRepository,
  );
  const roles: AdminRole[] = ["SUPER_ADMIN", "ADMIN"];

  for (const name of roles) {
    await repository.upsertRole({
      record: {
        name,
        permissions: [...ADMIN_ROLE_PERMISSIONS[name]],
      },
    });
  }

  const username = cfg.SUPER_ADMIN_USERNAME;
  const existingAdmin = await repository.findByUsername(username);

  if (existingAdmin) {
    if (existingAdmin.role !== "SUPER_ADMIN" || !existingAdmin.isActive) {
      throw new Error(
        "Configured SUPER_ADMIN account exists but is not active with the SUPER_ADMIN role",
      );
    }

    return;
  }

  const passwordHash = await argon2.hash(cfg.SUPER_ADMIN_PASSWORD);

  try {
    await repository.create({
      record: {
        username,
        passwordHash,
        isActive: true,
        role: "SUPER_ADMIN",
      },
    });
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }
    const concurrentAdmin = await repository.findByUsername(username);

    if (concurrentAdmin?.role === "SUPER_ADMIN" && concurrentAdmin.isActive) {
      return;
    }

    throw error;
  }
}
