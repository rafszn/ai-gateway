export type TransactionContext = unknown;

export type TransactionRunner = <T>(
  operation: (session: TransactionContext) => Promise<T>,
) => Promise<T>;
