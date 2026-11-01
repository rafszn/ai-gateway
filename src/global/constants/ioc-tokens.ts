export const IOCTokens = {
  RedisClient: Symbol("RedisClient"),
  CacheService: Symbol("CacheService"),
  MailProvider: Symbol("MailProvider"),
  UserRepository: Symbol("UserRepository"),
  UsageRepository: Symbol("UsageRepository"),
  StorageProvider: Symbol("StorageProvider"),
  QuotaRepository: Symbol("QuotaRepository"),
  AdminRepository: Symbol("AdminRepository"),
  ApiKeyRepository: Symbol("ApiKeyRepository"),
  TransactionRunner: Symbol("TransactionRunner"),
} as const;
