import { Router } from "express";
import {
  authenticateAdmin,
  requirePermission,
} from "../../../global/middlewares/authenticate-admin.js";
import { adminLoginSchema, createAdminSchema } from "./dto.js";
import { validate } from "../../../global/middlewares/validator.js";
import { createAdmin, getCurrentAdmin, loginAdmin } from "./controller.js";

const router = Router();

router.get("/auth/me", authenticateAdmin, getCurrentAdmin);
router.post("/auth/login", validate(adminLoginSchema), loginAdmin);

router.post(
  "/",
  authenticateAdmin,
  requirePermission("admins.create"),
  validate(createAdminSchema),
  createAdmin,
);

export default router;
