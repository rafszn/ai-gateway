import { Router } from "express";
import AuthRoutes from "./core/Modules/Auth/routes.js";
import AdminRoutes from "./core/Modules/Admins/routes.js";
import MemberRoutes from "./core/Modules/Members/routes.js";
import ApiKeyRoutes from "./core/Modules/Apikeys/routes.js";
import ResponsesRoutes from "./core/Modules/Responses/routes.js";

const router = Router();

router.use("/auth", AuthRoutes);
router.use("/admin", AdminRoutes);
router.use("/members/:memberId/keys", ApiKeyRoutes);
router.use("/members", MemberRoutes);

router.use("/responses", ResponsesRoutes);
export default router;