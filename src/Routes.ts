import { Router } from "express";
import AuthRoutes from "./core/Modules/Auth/routes.js";
import AdminRoutes from "./core/Modules/Admins/routes.js";
import MemberRoutes from "./core/Modules/Members/routes.js";
import ApiKeyRoutes from "./core/Modules/Apikeys/routes.js";
import ResponsesRoutes from "./core/Modules/Responses/routes.js";
import { globalRateLimiter } from "./global/middlewares/rate-limiter.js";

const router = Router();

router.use("/auth", globalRateLimiter, AuthRoutes);
router.use("/admin", globalRateLimiter, AdminRoutes);
router.use("/members/:memberId/keys", globalRateLimiter, ApiKeyRoutes);
router.use("/members", globalRateLimiter, MemberRoutes);

router.use("/responses", ResponsesRoutes);
export default router;