import type {
  CreateMemberDTO,
  UpdateMemberDTO,
  ListMembersQueryDTO,
} from "./dto.js";
import memberService from "./service.js";
import type { RequestHandler } from "express";
import { HTTP_STATUS } from "../../../global/constants/http-status-codes.js";

export const listMembers: RequestHandler = async (req, res, next) => {
  try {
    const query = req.query as unknown as ListMembersQueryDTO;
    const data = await memberService.listMembers(query);

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

export const getMember: RequestHandler<{ id: string }> = async (
  req,
  res,
  next,
) => {
  try {
    const data = await memberService.getMember(req.params.id);

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const createMember: RequestHandler = async (req, res, next) => {
  try {
    const data = await memberService.createMember(req.body as CreateMemberDTO);

    return res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: "Member created",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const updateMember: RequestHandler<{ id: string }> = async (
  req,
  res,
  next,
) => {
  try {
    const data = await memberService.updateMember({
      id: req.params.id,
      changes: req.body as UpdateMemberDTO,
    });

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Member updated",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

export const deleteMember: RequestHandler<{ id: string }> = async (
  req,
  res,
  next,
) => {
  try {
    await memberService.deleteMember(req.params.id);
    return res.status(HTTP_STATUS.NO_CONTENT).send();
  } catch (error) {
    return next(error);
  }
};
