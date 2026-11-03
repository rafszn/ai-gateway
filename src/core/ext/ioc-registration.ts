import { container } from "tsyringe";
import logger from "../../config.js";
import {
  AdminRepository,
  type IAdminRepository,
} from "../../data/models/admin/index.js";
import {
  UserRepository,
  type IUserRepository,
} from "../../data/models/user/index.js";
import {
  ApiKeyRepository,
  type IApiKeyRepository,
} from "../../data/models/api-key/index.js";
import {
  QuotaRepository,
  type IQuotaRepository,
} from "../../data/models/quota/index.js";
import {
  UsageRepository,
  type IUsageRepository,
} from "../../data/models/usage/index.js";
import { IOCTokens } from "../../global/constants/ioc-tokens.js";
import { withTransaction } from "../../data/transactions/mongo/index.js";
import type { TransactionRunner } from "../../data/transactions/types.js";
import type { IQuotaStore } from "../Modules/Quotas/contracts/quota-store.contract.js";
import type { CacheService } from "../infrastructure/Cache/contracts/cache.contract.js";
import { ResendMailAdapterImpl } from "../infrastructure/Mail/adapters/resend.adapter.js";
import type { MailServiceContract } from "../infrastructure/Mail/contracts/mail.contract.js";
import { MemoryCacheAdapterImpl } from "../infrastructure/Cache/adapters/memory-cache.adapter.js";
import type { IApiKeyAuthCache } from "../Modules/Apikeys/contracts/api-key-auth-cache.contract.js";
import { InMemoryQuotaStoreAdapter } from "../Modules/Quotas/adapters/in-memory-quota-store.adapter.js";
import { InMemoryApiKeyAuthCacheAdapter } from "../Modules/Apikeys/adapters/in-memory-api-key-auth-cache.adapter.js";

export const registerIoc = async (): Promise<void> => {
  container.registerSingleton<IAdminRepository>(
    IOCTokens.AdminRepository,
    AdminRepository,
  );
  container.registerSingleton<IUserRepository>(
    IOCTokens.UserRepository,
    UserRepository,
  );
  container.registerSingleton<IApiKeyRepository>(
    IOCTokens.ApiKeyRepository,
    ApiKeyRepository,
  );
  container.registerSingleton<IQuotaRepository>(
    IOCTokens.QuotaRepository,
    QuotaRepository,
  );
  container.registerSingleton<IUsageRepository>(
    IOCTokens.UsageRepository,
    UsageRepository,
  );

  container.registerSingleton<IApiKeyAuthCache>(
    IOCTokens.ApiKeyAuthCache,
    InMemoryApiKeyAuthCacheAdapter,
  );

  container.registerSingleton<IQuotaStore>(
    IOCTokens.QuotaStore,
    InMemoryQuotaStoreAdapter,
  );

  container.register<TransactionRunner>(IOCTokens.TransactionRunner, {
    useValue: withTransaction,
  });

  container.registerSingleton<CacheService>(
    IOCTokens.CacheService,
    MemoryCacheAdapterImpl,
  );

  container.registerSingleton<MailServiceContract>(
    IOCTokens.MailProvider,
    ResendMailAdapterImpl,
  );

  logger.info("IOC Containers Initialized.");
};
