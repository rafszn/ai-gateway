import type {
  NewUserRecord,
  IUserRepository,
  UpdateUserRecord,
} from "../../../data/models/user/index.js";
import { container, inject, injectable } from "tsyringe";
import { IOCTokens } from "../../../global/constants/ioc-tokens.js";
import { TransactionRunner } from "../../../data/transactions/types.js";
import { AppError } from "../../../global/middlewares/error-handler.js";
import type { IApiKeyRepository } from "../../../data/models/api-key/index.js";
import type { IApiKeyAuthCache } from "../Apikeys/contracts/api-key-auth-cache.contract.js";

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

@injectable()
class MemberService {
  constructor(
    @inject(IOCTokens.UserRepository)
    private readonly userRepository: IUserRepository,
    @inject(IOCTokens.ApiKeyAuthCache)
    private readonly apiKeyAuthCache: IApiKeyAuthCache,
    @inject(IOCTokens.ApiKeyRepository)
    private readonly apiKeyRepository: IApiKeyRepository,
    @inject(IOCTokens.TransactionRunner)
    private readonly transactionRunner: TransactionRunner,
  ) {}

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

  async deleteMember(params: { id: string; adminId: string }): Promise<void> {
    await this.transactionRunner(async (session) => {
      const deletedMember = await this.userRepository.deleteById({
        id: params.id,
        session,
      });

      if (!deletedMember) {
        throw new AppError("Member not found", 404);
      }

      await this.apiKeyRepository.revokeAllByMemberId({
        memberId: params.id,
        revokedAt: new Date(),
        revokedByAdminId: params.adminId,
        session,
      });
    });

    await this.apiKeyAuthCache.invalidateMember(params.id);
  }
}

const memberService = container.resolve(MemberService);
export default memberService;
