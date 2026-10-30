export type AuthProvider = "local" | "google";

/** Opaque transaction handle. */
export type TransactionContext = unknown;

/** User record. DB-agnostic. */
export interface UserRecord {
  id: string;
  state: string;
  email: string;
  firstName: string;
  lastName: string;
  username: string;
  password: string;
  emailToken: string | null;
  phoneNumber: string;
  isVerified: boolean;
  resetPasswordExpiry: Date | null;
  resetPasswordToken: string | null;
  authProvider: AuthProvider;
  createdAt: Date;
  updatedAt: Date;
}

/** Input shape for creating a User. */
export type NewUserRecord = Omit<
  UserRecord,
  | "id"
  | "createdAt"
  | "updatedAt"
  | "isVerified"
  | "emailToken"
  | "authProvider"
  | "resetPasswordToken"
  | "resetPasswordExpiry"
> & {
  isVerified?: boolean;
  emailToken?: string | null;
  authProvider?: AuthProvider;
  resetPasswordExpiry?: Date | null;
  resetPasswordToken?: string | null;
};
