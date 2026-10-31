import { Router } from "express";
import AuthRoutes from "./core/Modules/Auth/routes.js";
import AdminRoutes from "./core/Modules/Admins/routes.js";
import MemberRoutes from "./core/Modules/Members/routes.js";

const router = Router();

router.use("/auth", AuthRoutes);
router.use("/admin", AdminRoutes);
router.use("/members", MemberRoutes);
export default router;
