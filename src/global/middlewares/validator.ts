import { z } from "zod";
import logger from "../../config.js";
import { Request, Response, NextFunction } from "express";
import { HTTP_STATUS } from "../constants/http-status-codes.js";

type ValidationTarget = "body" | "query" | "params";

export const validate =
  <T extends z.ZodType>(schema: T, target: ValidationTarget = "body") =>
  (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.length > 0 ? issue.path.join(".") : target,
        message: issue.message,
      }));
      logger.error(
        "Validation error",
        JSON.stringify({ target, errors }, null, 2),
      );
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json({ success: false, message: "Validation failed", errors });
    }

    if (target === "query") {
      Object.defineProperty(req, "query", {
        writable: true,
        value: result.data,
        configurable: true,
      });
    } else {
      req[target] = result.data;
    }

    next();
  };
