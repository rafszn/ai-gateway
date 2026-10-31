import cron from "node-cron";
import { expireApiKeys } from "./expire-api-keys.js";

export const initCronJobs = () => {
  void expireApiKeys();

  cron.schedule("0 * * * *", () => {
    void expireApiKeys();
  });
};
