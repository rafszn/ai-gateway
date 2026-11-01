import "reflect-metadata";
import { dbInit } from "./data/init.js";
import cfg from "./global/environment.config.js";
import { initCronJobs } from "./cron-jobs/index.js";
import { seedAdminAccess } from "./data/seed/admin.seed.js";
import { registerIoc } from "./core/ext/ioc-registration.js";

async function bootstrap() {
  await dbInit();
  await registerIoc();
  await seedAdminAccess();

  const App = await import("./app.js");
  const app = new App.default();
  app.initialize();
  
  const port = Number(cfg.PORT) || 8080;
  initCronJobs();
  app.listen(port);
}

bootstrap();
