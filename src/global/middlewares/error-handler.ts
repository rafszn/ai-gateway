import mongoose from "mongoose";
import logger from "../../config.js";
import { Response, Request, NextFunction } from "express";
import { HTTP_STATUS } from "../constants/http-status-codes.js";

interface MongoDuplicateKeyError {
  code: 11000;
  keyValue?: Record<string, unknown>;
}

function isMongoDuplicateKeyError(err: unknown): err is MongoDuplicateKeyError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === 11000
  );
}

function hasErrorType(err: unknown, type: string): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "type" in err &&
    err.type === type
  );
}

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);

    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (res.headersSent) {
    return next(err);
  }

  let status: number = HTTP_STATUS.INTERNAL_SERVER_ERROR;
  let message = "Internal Server Error";

  if (hasErrorType(err, "entity.too.large")) {
    status = HTTP_STATUS.PAYLOAD_TOO_LARGE;
    message = "Request body too large";
  } else if (hasErrorType(err, "entity.parse.failed")) {
    status = HTTP_STATUS.BAD_REQUEST;
    message = "Invalid JSON request body";
  } else if (isMongoDuplicateKeyError(err)) {
    status = HTTP_STATUS.CONFLICT;
    const field = err.keyValue ? Object.keys(err.keyValue)[0] : "field";
    message = `${field} already exists`;
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = HTTP_STATUS.BAD_REQUEST;
    message = "Invalid data";
  } else if (err instanceof mongoose.Error.CastError) {
    status = HTTP_STATUS.BAD_REQUEST;
    message = `Invalid ${err.path}`;
  } else if (
    err instanceof AppError &&
    err.statusCode >= 400 &&
    err.statusCode < 500
  ) {
    status = err.statusCode;
    message = err.message;
  }

  const errorDetails =
    err instanceof Error
      ? {
          name: err.name,
          message: err.message,
          stack: err.stack,
        }
      : err;

  logger.error("ERROR", {
    error: errorDetails,
    path: req.path,
    responseStatus: status,
  });

  return res.status(status).json({
    success: false,
    message,
    path: req.path,
  });
}
