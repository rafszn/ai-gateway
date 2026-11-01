import hpp from "hpp";
import cors from "cors";
import helmet from "helmet";
import logger from "./config.js";
import Routes from "./Routes.js";
import compression from "compression";
import cookieParser from "cookie-parser";
import express, { Application } from "express";
import { setupSwaggerDocs } from "./docs/swagger.js";
import corsOptions from "./global/constants/cors-options.js";
import requestLogger from "./global/middlewares/request-logger.js";
import { notFoundHandler } from "./global/middlewares/not-found.js";
import { errorHandler } from "./global/middlewares/error-handler.js";
import { requestGuard } from "./global/middlewares/request-guard.js";
import { HTTP_STATUS } from "./global/constants/http-status-codes.js";
import { container } from "tsyringe";
import { InMemoryBroker } from "./core/infrastructure/Messaging/inMemory/in-memory-broker.js";
import { MessagingTokens } from "./core/infrastructure/Messaging/tokens.js";

export default class App {
  public app: Application;
  constructor() {
    this.app = express();
  }

  async initialize() {
    this.app.set("trust proxy", true); // req.ip
    // security middlewares
    this.app.use(helmet({ contentSecurityPolicy: false }));
    this.app.use(cors(corsOptions));
    this.app.use(compression());
    this.app.use(hpp());
    this.app.use(cookieParser());
    this.app.use(express.json({ limit: "100mb" }));
    this.app.use(express.urlencoded({ extended: true, limit: "100mb" }));
    this.app.use(requestLogger);
    this.app.use(requestGuard); // block scanners / traversal
    this.app.use(express.static("public"));

    // health check
    this.app.get("/health", (req, res) => {
      const uptime = process.uptime();
      const broker = container.resolve<InMemoryBroker>(
        MessagingTokens.MemoryBroker,
      );

      const days = Math.floor(uptime / 86400);
      const seconds = Math.floor(uptime % 60);
      const minutes = Math.floor((uptime % 3600) / 60);
      const hours = Math.floor((uptime % 86400) / 3600);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        status: "healthy",
        service: "AI GATEWAY",
        uptime: {
          seconds: uptime,
          human: `${days}d ${hours}h ${minutes}m ${seconds}s`,
        },
        queueStats: broker.getStats(),
        timestamp: new Date().toISOString(),
      });
    });

    this.app.get("/", (req, res) => {
      res.status(HTTP_STATUS.OK).json({
        server: "AI GATEWAY",
      });
    });

    // routes
    this.app.use("/v1", Routes);

    //docs
    setupSwaggerDocs(this.app);

    // 404 and error handler
    this.app.use(notFoundHandler);
    this.app.use(errorHandler);
  }

  listen(port: number) {
    this.app.listen(port, () => {
      logger.info(`Server running on port ${port}`);
    });
  }
}
