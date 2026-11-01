import fs from "node:fs";
import winston, { format } from "winston";

export interface LoggerConfig {
  level?: "debug" | "info";
}

export interface ILogger {
  debug(message: string, ...meta: unknown[]): void;
  info(message: string, ...meta: unknown[]): void;
  warn(message: string, ...meta: unknown[]): void;
  error(message: string | Error, ...meta: unknown[]): void;
  verbose(message: string, ...meta: unknown[]): void;
}

export class Logger implements ILogger {
  private readonly logger: winston.Logger;

  constructor(config: LoggerConfig = {}) {
    fs.mkdirSync("logs", { recursive: true });

    const shared = format.combine(
      format.errors({ stack: true }),
      format.timestamp(),
    );

    const buildMeta = (
      info: winston.Logform.TransformableInfo,
      includeStack: boolean,
    ): string => {
      const splat = info[Symbol.for("splat")] as unknown[] | undefined;

      if (!splat || splat.length === 0) return "";

      return splat
        .map((value) => {
          if (value instanceof Error) {
            return includeStack
              ? (value.stack ?? value.message)
              : value.message;
          }

          if (typeof value === "object" && value !== null) {
            try {
              return JSON.stringify(value, null, 2);
            } catch {
              return "[Unserializable object]";
            }
          }

          return String(value);
        })
        .join(" ");
    };

    const consoleFormat = format.combine(
      shared,
      format.colorize(),
      format.printf((info) => {
        const meta = buildMeta(info, false);
        return `${info.timestamp} ${info.level}: ${info.message}${meta ? ` ${meta}` : ""}`;
      }),
    );

    const fileFormat = format.combine(
      shared,
      format.printf((info) => {
        const meta = buildMeta(info, true);
        return JSON.stringify(
          {
            timestamp: info.timestamp,
            level: info.level,
            message: info.message,
            meta: meta || undefined,
          },
          null,
          2,
        );
      }),
    );

    this.logger = winston.createLogger({
      level: config.level ?? "info",
      format: shared,
      transports: [
        new winston.transports.Console({ format: consoleFormat }),
        new winston.transports.File({
          filename: "logs/error.log",
          level: "error",
          format: fileFormat,
        }),
      ],
    });
  }

  debug(message: string, ...meta: unknown[]): void {
    this.logger.debug(message, ...meta);
  }

  info(message: string, ...meta: unknown[]): void {
    this.logger.info(message, ...meta);
  }

  warn(message: string, ...meta: unknown[]): void {
    this.logger.warn(message, ...meta);
  }

  error(message: string | Error, ...meta: unknown[]): void {
    if (message instanceof Error) {
      this.logger.error(message.message, {
        error: {
          name: message.name,
          message: message.message,
          stack: message.stack,
        },
        ...Object.fromEntries(
          meta.map((value, index) => [`meta_${index + 1}`, value]),
        ),
      });

      return;
    }

    this.logger.error(message, ...meta);
  }

  verbose(message: string, ...meta: unknown[]): void {
    this.logger.verbose(message, ...meta);
  }
}

const logger = new Logger();
export default logger;
