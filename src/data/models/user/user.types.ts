/** Opaque transaction handle. */
export type TransactionContext = unknown;

export interface UserRecord {
  id: string;
  username: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewUserRecord {
  username: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phoneNumber?: string | null;
}

export type UpdateUserRecord = Partial<NewUserRecord>;
