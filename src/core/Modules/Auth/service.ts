import { container, inject, injectable } from "tsyringe";
import { MINUTE } from "../../../global/constants/time.js";
import { IOCTokens } from "../../../global/constants/ioc-tokens.js";
import { CacheService } from "../../infrastructure/Cache/contracts/cache.contract.js";

@injectable()
class AuthService {
  private readonly authCachePrefix = "myapp:auth";

  constructor(
    @inject(IOCTokens.CacheService)
    private readonly cache: CacheService,
  ) {}

  async createAuth() {
    const cacheKey = this.cache.createKey(this.authCachePrefix);
    return this.cache.getOrSet(
      cacheKey,
      async () => ({
        module: "Auth",
        status: "ready",
      }),
      5 * MINUTE,
    );
  }
}

const authService = container.resolve(AuthService);
export default authService;
