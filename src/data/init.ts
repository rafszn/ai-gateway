import logger from "../config.js";
import mongoose, { Connection } from "mongoose";
import cfg from "../global/environment.config.js";

let connectionPromise: Promise<typeof mongoose> | null = null;

export async function dbInit(): Promise<Connection> {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!connectionPromise) {
    const uri = cfg.MONGO_URL;

    if (!uri) {
      throw new Error("MONGODB_URI is not configured");
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
