import { Router } from "express";
import {
  authenticateAdmin,
  requirePermission,
} from "../../../global/middlewares/authenticate-admin.js";
import {
  apiKeyParamsSchema,
  createApiKeySchema,
  listApiKeysQuerySchema,
  updateApiKeyNameSchema,
  apiKeyMemberParamsSchema,
  updateApiKeyLimitsSchema,
  replaceApiKeyModelsSchema,
} from "./dto.js";
import {
  listApiKeys,
  createApiKey,
  deleteApiKey,
  revokeApiKey,
  updateApiKeyName,
  reactivateApiKey,
  updateApiKeyLimits,
  replaceApiKeyModels,
} from "./controller.js";
import { validate } from "../../../global/middlewares/validator.js";

const router = Router({ mergeParams: true });

router.use(authenticateAdmin, validate(apiKeyMemberParamsSchema, "params"));

router.get(
  "/",
  requirePermission("keys.read"),
  requirePermission("models.read"),
  requirePermission("limits.read"),
  validate(listApiKeysQuerySchema, "query"),
  listApiKeys,
);

router.post(
  "/",
  requirePermission("keys.create"),
  requirePermission("models.update"),
  requirePermission("limits.update"),
  validate(createApiKeySchema),
  createApiKey,
);

router.patch(
  "/:keyId/name",
  validate(apiKeyParamsSchema, "params"),
  requirePermission("keys.update"),
  validate(updateApiKeyNameSchema),
  updateApiKeyName,
);

router.patch(
  "/:keyId/models",
  validate(apiKeyParamsSchema, "params"),
  requirePermission("models.update"),
  validate(replaceApiKeyModelsSchema),
  replaceApiKeyModels,
);

router.patch(
  "/:keyId/limits",
  validate(apiKeyParamsSchema, "params"),
  requirePermission("limits.update"),
  validate(updateApiKeyLimitsSchema),
  updateApiKeyLimits,
);

router.post(
  "/:keyId/revoke",
  validate(apiKeyParamsSchema, "params"),
  requirePermission("keys.revoke"),
  revokeApiKey,
);

router.post(
  "/:keyId/reactivate",
  validate(apiKeyParamsSchema, "params"),
  requirePermission("keys.update"),
  reactivateApiKey,
);

router.delete(
  "/:keyId",
  validate(apiKeyParamsSchema, "params"),
  requirePermission("keys.delete"),
  deleteApiKey,
);

export default router;
