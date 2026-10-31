import logger from "../config.js";
import { ApiKeyRepository } from "../data/models/api-key/api-key.mongoose-repository.js";

const apiKeyRepository = new ApiKeyRepository();
async function expireApiKeys(): Promise<void> {
  try {
    const count = await apiKeyRepository.expireDue({ now: new Date() });
    if (count > 0) {
      logger.info("[API_KEYS] Expired keys", count);
    }
  } catch (error) {
    logger.error("[API_KEYS] Key expiry job failed", error);
  }
}

export { expireApiKeys };
