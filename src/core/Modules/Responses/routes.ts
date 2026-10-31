import { Router } from "express";
import { createResponse } from "./controller.js";
import { authenticateApiKey } from "../../../global/middlewares/authenticate-api-key.js";

const router = Router();

router.post("/", authenticateApiKey, createResponse);

export default router;
