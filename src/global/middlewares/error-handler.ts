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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction,
) {
  type HttpStatusCode = (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS];
  let status: HttpStatusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
  let message = "Internal Server Error";

  if (isMongoDuplicateKeyError(err)) {
    status = HTTP_STATUS.CONFLICT;
    const field = err.keyValue ? Object.keys(err.keyValue)[0] : "field";

    message = `${field} already exists`;
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = HTTP_STATUS.BAD_REQUEST;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join(", ");
  } else if (err instanceof mongoose.Error.CastError) {
    status = HTTP_STATUS.BAD_REQUEST;
    message = `Invalid ${err.path}`;
  }

  if (err instanceof Error) {
    message = err.message;

    // custom error support
    if ("statusCode" in err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      status = (err as any).statusCode;
    }
  }

  logger.error("ERROR", {
    message,
    path: req.path,
  });

  res.status(status).json({
    success: false,
    message,
    path: req.path,
  });
}
