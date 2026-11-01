import logger from "../config.js";
import { container } from "tsyringe";
import { IOCTokens } from "../global/constants/ioc-tokens.js";
import { IApiKeyRepository } from "../data/models/api-key/api-key.repository.js";

async function expireApiKeys(): Promise<void> {
  try {
    const apiKeyRepository = container.resolve<IApiKeyRepository>(
      IOCTokens.ApiKeyRepository,
    );
    const count = await apiKeyRepository.expireDue({ now: new Date() });
    if (count > 0) {
      logger.info("[API_KEYS] Expired keys", count);
    }
  } catch (error) {
    logger.error("[API_KEYS] Key expiry job failed", error);
  }
}

export { expireApiKeys };
