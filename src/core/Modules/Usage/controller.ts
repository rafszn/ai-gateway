import usageService from "./service.js";
import type { RequestHandler } from "express";
import type { PublicUsageQueryDTO } from "./dto.js";
import { HTTP_STATUS } from "../../../global/constants/http-status-codes.js";

export const getPublicUsage: RequestHandler = async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");

  try {
    const query = req.query as unknown as PublicUsageQueryDTO;
    const data = await usageService.getPublicUsage(query.keyName);

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};
