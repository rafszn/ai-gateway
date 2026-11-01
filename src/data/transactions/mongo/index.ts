import { mongoConnection } from "../../init.js";
import type { TransactionContext, TransactionRunner } from "../types.js";

export const withTransaction: TransactionRunner = async <T>(
  operation: (session: TransactionContext) => Promise<T>,
) => {
  const session = await mongoConnection.startSession();
  let result!: T;
  let completed = false;

  try {
    await session.withTransaction(async () => {
      result = await operation(session as TransactionContext);
      completed = true;
    });

    if (!completed) {
      throw new Error("transaction did not complete");
    }

    return result;
  } finally {
    await session.endSession();
  }
};
