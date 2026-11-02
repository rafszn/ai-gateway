import { Router } from "express";
import { listModels } from "./controller.js";
import { authenticateApiKey } from "../../../global/middlewares/authenticate-api-key.js";

const router = Router();

router.get("/", authenticateApiKey, listModels);

export default router;
