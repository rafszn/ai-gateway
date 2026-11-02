import { Router } from "express";
import {
  globalRateLimiter,
  publicRateLimiter,
} from "./global/middlewares/rate-limiter.js";
import AuthRoutes from "./core/Modules/Auth/routes.js";
import UsageRoutes from "./core/Modules/Usage/routes.js";
import AdminRoutes from "./core/Modules/Admins/routes.js";
import MemberRoutes from "./core/Modules/Members/routes.js";
import ApiKeyRoutes from "./core/Modules/Apikeys/routes.js";
import ModelsRoutes from "./core/Modules/AiModels/routes.js";
import ResponsesRoutes from "./core/Modules/Responses/routes.js";

const router = Router();

router.use("/auth", globalRateLimiter, AuthRoutes);
router.use("/admin", globalRateLimiter, AdminRoutes);
router.use("/members/:memberId/keys", globalRateLimiter, ApiKeyRoutes);
router.use("/members", globalRateLimiter, MemberRoutes);
router.use("/usage", publicRateLimiter, UsageRoutes);
router.use("/models", publicRateLimiter, ModelsRoutes);
router.use("/responses", ResponsesRoutes);
export default router;
