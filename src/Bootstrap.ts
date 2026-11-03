import "reflect-metadata";
import { container } from "tsyringe";
import { dbInit } from "./data/init.js";
import cfg from "./global/environment.config.js";
import { initCronJobs } from "./cron-jobs/index.js";
import { seedAdminAccess } from "./data/seed/admin.seed.js";
import { registerIoc } from "./core/ext/ioc-registration.js";
import { initializeMessaging } from "./core/ext/messaging.js";
import { IOCTokens } from "./global/constants/ioc-tokens.js";
import { IQuotaStore } from "./core/Modules/Quotas/contracts/quota-store.contract.js";

async function bootstrap() {
  await dbInit();
  initializeMessaging();
  await registerIoc();
  await seedAdminAccess();

  const quotaStore = container.resolve<IQuotaStore>(IOCTokens.QuotaStore);
  quotaStore.start();

  const { PlatformWorker } = await import("./workers/platform.worker.js");
  const worker = container.resolve(PlatformWorker);

  await worker.start();

  const App = await import("./app.js");
  const app = new App.default();
  app.initialize();

  const port = Number(cfg.PORT) || 8080;
  initCronJobs();
  app.listen(port);
}

bootstrap();
