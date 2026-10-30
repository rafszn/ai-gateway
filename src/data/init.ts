import logger from "../config.js";
import mongoose, { Connection } from "mongoose";
import cfg from "../global/environment.config.js";

let connectionPromise: Promise<typeof mongoose> | null = null;

export async function dbInit(): Promise<Connection | null> {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!connectionPromise) {
    const uri = cfg.MONGO_URL;

    if (!uri) {
      logger.info("MONGODB_URI is not configured");
      return null;
    }

    connectionPromise = mongoose.connect(uri);
  }

  await connectionPromise;
  const models = Object.values(mongoose.models);
  await Promise.all(models.map((model) => model.syncIndexes()));

  logger.info("[MONGO] initialized");

  return mongoose.connection;
}

export const mongoConnection = mongoose.connection;
