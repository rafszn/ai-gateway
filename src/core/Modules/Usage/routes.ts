import { Router } from "express";
import { getPublicUsage } from "./controller.js";
import { publicUsageQuerySchema } from "./dto.js";
import { validate } from "../../../global/middlewares/validator.js";

const router = Router();

router.get("/", validate(publicUsageQuerySchema, "query"), getPublicUsage);

export default router;
