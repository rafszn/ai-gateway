import {
  createMemberSchema,
  updateMemberSchema,
  listMembersQuerySchema,
} from "./dto.js";
import {
  getMember,
  listMembers,
  createMember,
  deleteMember,
  updateMember,
} from "./controller.js";
import { Router } from "express";
import {
  authenticateAdmin,
  requirePermission,
} from "../../../global/middlewares/authenticate-admin.js";
import { validate } from "../../../global/middlewares/validator.js";

const router = Router();

router.use(authenticateAdmin);

router.get(
  "/",
  requirePermission("members.read"),
  validate(listMembersQuerySchema, "query"),
  listMembers,
);

router.post(
  "/",
  requirePermission("members.create"),
  validate(createMemberSchema),
  createMember,
);

router.get("/:id", requirePermission("members.read"), getMember);

router.patch(
  "/:id",
  requirePermission("members.update"),
  validate(updateMemberSchema),
  updateMember,
);

router.delete("/:id", requirePermission("members.delete"), deleteMember);

export default router;
