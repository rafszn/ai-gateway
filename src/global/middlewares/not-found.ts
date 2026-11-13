import logger from "../../config.js";
import { Request, Response } from "express";
import { isScannerPath } from "../library/scanner.js";
import { HTTP_STATUS } from "../constants/http-status-codes.js";

export const notFoundHandler = (req: Request, res: Response) => {
  if (!isScannerPath(req.path)) {
    logger.error(
      `NOT_FOUND Method [${req.method}] | Route [${req.originalUrl}] not found`,
      { path: req.path },
    );
  }
  res.status(HTTP_STATUS.NOT_FOUND).json({
    success: false,
    message: `Method [${req.method}] | Route [${req.originalUrl}] not found`,
    code: "NOT_FOUND",
  });
};
