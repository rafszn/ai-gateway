import type {
  NewUserRecord,
  UpdateUserRecord,
} from "../../../data/models/user/index.js";
import { UserRepository } from "../../../data/models/user/index.js";
import { AppError } from "../../../global/middlewares/error-handler.js";

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

class MemberService {
  private readonly userRepository = new UserRepository();

  async listMembers(params: { page: number; limit: number }) {
    const result = await this.userRepository.list({
      offset: (params.page - 1) * params.limit,
      limit: params.limit,
    });

    return {
      items: result.items,
      page: params.page,
      limit: params.limit,
      total: result.total,
      totalPages: Math.ceil(result.total / params.limit),
    };
  }

  async getMember(id: string) {
    const member = await this.userRepository.findById(id);

    if (!member) {
      throw new AppError("Member not found", 404);
    }

    return member;
  }

  async createMember(record: NewUserRecord) {
    try {
      return await this.userRepository.create({ record });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new AppError("Username or email already exists", 409);
      }

      throw error;
    }
  }

  async updateMember(params: { id: string; changes: UpdateUserRecord }) {
    try {
      const member = await this.userRepository.update(params);

      if (!member) {
        throw new AppError("Member not found", 404);
      }

      return member;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new AppError("Username or email already exists", 409);
      }

      throw error;
    }
  }

  async deleteMember(id: string): Promise<void> {
    const deletedMember = await this.userRepository.deleteById({ id });

    if (!deletedMember) {
      throw new AppError("Member not found", 404);
    }
  }
}

const memberService = new MemberService();
export default memberService;
