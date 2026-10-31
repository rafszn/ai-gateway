import { DAY } from "./time.js";
import { ApiKeyTier } from "../../core/Modules/Apikeys/dto.js";
import { ApiKeyLimits } from "../../data/models/api-key/api-key.types.js";

const KEY_LIFETIME_MS = 30 * DAY;

const TIER_LIMITS: Record<ApiKeyTier, ApiKeyLimits> = {
  "2B": {
    tokensPerMinute: 500_000,
    dailyTokens: 140_000_000,
    weeklyTokens: 600_000_000,
    monthlyTokens: 2_000_000_000,
  },
  "1B": {
    tokensPerMinute: 250_000,
    dailyTokens: 70_000_000,
    weeklyTokens: 300_000_000,
    monthlyTokens: 1_000_000_000,
  },
  "600M": {
    tokensPerMinute: 150_000,
    dailyTokens: 40_000_000,
    weeklyTokens: 180_000_000,
    monthlyTokens: 600_000_000,
  },
  "300M": {
    tokensPerMinute: 150_000,
    dailyTokens: 20_000_000,
    weeklyTokens: 90_000_000,
    monthlyTokens: 300_000_000,
  },
};

export { KEY_LIFETIME_MS, TIER_LIMITS };
