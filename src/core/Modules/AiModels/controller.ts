import logger from "../../../config.js";
import type { RequestHandler } from "express";
import codexCatalog from "./models.json" with { type: "json" };
import { sendOpenAiError } from "../../../global/library/openai-error.js";
import { HTTP_STATUS } from "../../../global/constants/http-status-codes.js";
import type { GatewayApiKeyContext } from "../../../global/middlewares/authenticate-api-key.js";

interface CodexCatalogEntry {
  slug: string;
  model_messages?: {
    instructions_template?: string | null;
  } | null;
  [field: string]: unknown;
}

const catalogEntries = codexCatalog.models as unknown as CodexCatalogEntry[];

const toDeploymentId = (slug: string): string => `${slug.replace(/-1$/, "")}-1`;

const catalogByDeploymentId = new Map(
  catalogEntries.map((model) => [toDeploymentId(model.slug), model] as const),
);

export const listModels: RequestHandler = (_request, response) => {
  response.setHeader("Cache-Control", "private, no-store");
  response.setHeader("Pragma", "no-cache");

  const auth = response.locals.gatewayApiKey as
    | GatewayApiKeyContext
    | undefined;

  if (!auth) {
    return sendOpenAiError(response, HTTP_STATUS.UNAUTHORIZED, {
      message: "Invalid API key",
      type: "authentication_error",
      code: "invalid_api_key",
    });
  }

  const missingCatalogEntries = auth.key.models.filter(
    (modelId) => !catalogByDeploymentId.has(modelId),
  );

  if (missingCatalogEntries.length > 0) {
    logger.warn("Codex model metadata missing for allowed deployments", {
      keyId: auth.key.id,
      requestId: auth.requestId,
      modelIds: missingCatalogEntries,
    });
  }

  const models = auth.key.models.flatMap((modelId) => {
    const catalogModel = catalogByDeploymentId.get(modelId);

    if (!catalogModel) {
      return [];
    }

    return [
      {
        ...catalogModel,
        slug: modelId,
        base_instructions:
          catalogModel.model_messages?.instructions_template ?? "",
      },
    ];
  });

  return response.status(HTTP_STATUS.OK).json({ models });
};
