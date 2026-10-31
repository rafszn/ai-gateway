import adminService from "./service.js";
import type { RequestHandler } from "express";
import type { AdminLoginDTO, CreateAdminDTO } from "./dto.js";
import { HTTP_STATUS } from "../../../global/constants/http-status-codes.js";

export const loginAdmin: RequestHandler = async (req, res, next) => {
  try {
    const data = await adminService.login(req.body as AdminLoginDTO);

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const getCurrentAdmin: RequestHandler = (req, res) => {
  if (!req.admin) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      message: "Unauthorized",
    });
  }

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data: req.admin,
  });
};

export const createAdmin: RequestHandler = async (req, res, next) => {
  try {
    const data = await adminService.createAdmin(req.body as CreateAdminDTO);

    return res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: "Admin created",
      data,
    });
  } catch (error) {
    return next(error);
  }
};
