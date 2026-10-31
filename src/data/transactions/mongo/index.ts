import type { ClientSession } from "mongoose";
import { mongoConnection } from "../../init.js";

export async function withTransaction<T>(
  operation: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const session = await mongoConnection.startSession();
  let result!: T;
  let completed = false;

  try {
    await session.withTransaction(async () => {
      result = await operation(session);
      completed = true;
    });

    if (!completed) {
      throw new Error("transaction did not complete");
    }

    return result;
  } finally {
    await session.endSession();
  }
}
