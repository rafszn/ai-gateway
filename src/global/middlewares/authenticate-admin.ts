import cfg from "../environment.config.js";
import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { HTTP_STATUS } from "../constants/http-status-codes.js";
import adminService from "../../core/Modules/Admins/service.js";
import { AdminPermission } from "../../core/Modules/Admins/permissions.js";

const { JsonWebTokenError } = jwt;

export const authenticateAdmin: RequestHandler = async (req, res, next) => {
  const match = req.get("authorization")?.match(/^Bearer\s+(\S+)$/i);

  if (!match?.[1]) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      message: "Unauthorized",
    });
  }

  try {
    const payload = jwt.verify(match[1], cfg.ADMIN_JWT_SECRET);

    if (typeof payload === "string" || typeof payload.sub !== "string") {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const principal = await adminService.resolvePrincipal(payload.sub);

    if (!principal) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: "Unauthorized",
      });
    }

    req.admin = principal;
    return next();
  } catch (error) {
    if (error instanceof JsonWebTokenError) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: "Unauthorized",
      });
    }

    return next(error);
  }
};

export function requirePermission(permission: AdminPermission): RequestHandler {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!req.admin.permissions.includes(permission)) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: "Forbidden",
      });
    }

    return next();
  };
}
