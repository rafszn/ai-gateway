import App from "./app.js";
import { dbInit } from "./data/init.js";
import cfg from "./global/environment.config.js";
import { initCronJobs } from "./cron-jobs/index.js";
import { seedAdminAccess } from "./data/seed/admin.seed.js";

async function bootstrap() {
  const app = new App();
  await app.initialize();
  const port = Number(cfg.PORT) || 8080;
  await dbInit();
  await seedAdminAccess();
  initCronJobs();
  app.listen(port);
}

bootstrap();
