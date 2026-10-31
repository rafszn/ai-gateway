import type {
  CreateApiKeyDTO,
  UpdateApiKeyNameDTO,
  ListApiKeysQueryDTO,
  UpdateApiKeyLimitsDTO,
  ReplaceApiKeyModelsDTO,
} from "./dto.js";
import apiKeyService from "./service.js";
import type { RequestHandler } from "express";
import { HTTP_STATUS } from "../../../global/constants/http-status-codes.js";

type MemberParams = { memberId: string };
type KeyParams = { memberId: string; keyId: string };

export const listApiKeys: RequestHandler<MemberParams> = async (
  req,
  res,
  next,
) => {
  try {
    const query = req.query as unknown as ListApiKeysQueryDTO;
    const data = await apiKeyService.listKeys({
      memberId: req.params.memberId,
      page: query.page,
      limit: query.limit,
    });

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      data: data.items,
      pagination: {
        page: data.page,
        limit: data.limit,
        total: data.total,
        totalPages: data.totalPages,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const createApiKey: RequestHandler<MemberParams> = async (
  req,
  res,
  next,
) => {
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Cache-Control", "no-store");

  try {
    const data = await apiKeyService.createKey({
      memberId: req.params.memberId,
      adminId: String(req.admin?.id),
      input: req.body as CreateApiKeyDTO,
    });

    return res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: "Copy the API key now. It will not be shown again.",
      data: {
        key: data.key,
        secret: data.secret,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const updateApiKeyName: RequestHandler<KeyParams> = async (
  req,
  res,
  next,
) => {
  try {
    const body = req.body as UpdateApiKeyNameDTO;
    const key = await apiKeyService.updateName({
      memberId: req.params.memberId,
      keyId: req.params.keyId,
      name: body.name,
    });

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "API key name updated",
      data: key,
    });
  } catch (error) {
    return next(error);
  }
};

export const replaceApiKeyModels: RequestHandler<KeyParams> = async (
  req,
  res,
  next,
) => {
  try {
    const body = req.body as ReplaceApiKeyModelsDTO;
    const key = await apiKeyService.replaceModels({
      memberId: req.params.memberId,
      keyId: req.params.keyId,
      models: body.models,
    });

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "API key models updated",
      data: key,
    });
  } catch (error) {
    return next(error);
  }
};

export const updateApiKeyLimits: RequestHandler<KeyParams> = async (
  req,
  res,
  next,
) => {
  try {
    const key = await apiKeyService.updateLimits({
      memberId: req.params.memberId,
      keyId: req.params.keyId,
      changes: req.body as UpdateApiKeyLimitsDTO,
    });

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "API key limits updated",
      data: key,
    });
  } catch (error) {
    return next(error);
  }
};

export const revokeApiKey: RequestHandler<KeyParams> = async (
  req,
  res,
  next,
) => {
  try {
    const key = await apiKeyService.revokeKey({
      keyId: req.params.keyId,
      memberId: req.params.memberId,
      adminId: String(req.admin?.id),
    });

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "API key revoked",
      data: key,
    });
  } catch (error) {
    return next(error);
  }
};

export const reactivateApiKey: RequestHandler<KeyParams> = async (
  req,
  res,
  next,
) => {
  try {
    const key = await apiKeyService.reactivateKey({
      keyId: req.params.keyId,
      memberId: req.params.memberId,
      adminId: String(req.admin?.id),
    });

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "API key reactivated for 30 days",
      data: key,
    });
  } catch (error) {
    return next(error);
  }
};

export const deleteApiKey: RequestHandler<KeyParams> = async (
  req,
  res,
  next,
) => {
  try {
    await apiKeyService.deleteKey({
      memberId: req.params.memberId,
      keyId: req.params.keyId,
    });

    return res.status(HTTP_STATUS.NO_CONTENT).send();
  } catch (error) {
    return next(error);
  }
};
