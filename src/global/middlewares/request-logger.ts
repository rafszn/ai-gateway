import logger from "../../config.js";
import { isScannerPath } from "../library/scanner.js";
import { Request, Response, NextFunction } from "express";

const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  res.on("finish", () => {
    if (res.statusCode === 404 && isScannerPath(req.path)) return;
    const duration = Date.now() - start;

    logger.info(
      `${req.method} - ${req.originalUrl} - ${
        res.statusCode
      } - ${duration}ms - ${new Date().toISOString()}`,
    );
  });

  next();
};

export default requestLogger;
