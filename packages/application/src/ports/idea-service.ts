import type {
  ApiError,
  AnswerClarificationRequest,
  AnswerDto,
  CreateIdeaRequest,
  IdeaAuthorityDto,
  IdeaDetailDto,
  IdeaSummaryDto,
  ProjectDetailDto,
  ProjectMutationDto,
  ProjectSummaryDto,
  PromoteIdeaRequest,
} from "@idea/contracts";

export type ErrorPayload = ApiError;

export type WriteResult<T> =
  | {
      ok: true;
      status: number;
      data: T;
      requestId: string;
      idempotentReplay: boolean;
    }
  | {
      ok: false;
      status: number;
      error: ErrorPayload;
      requestId: string;
    };

export interface Page<T> {
  items: T[];
  limit: number;
  nextCursor: string | null;
}

export interface CommandContext {
  idempotencyKey: string;
  requestId: string;
  requestDigest: string;
}

export interface IdeaService {
  createIdea(
    input: CreateIdeaRequest,
    context: CommandContext,
  ): Promise<
    WriteResult<{
      idea: IdeaAuthorityDto;
      created: { statementIds: string[]; questionIds: string[] };
    }>
  >;
  answerClarification(
    ideaId: string,
    questionId: string,
    input: AnswerClarificationRequest,
    context: CommandContext,
  ): Promise<
    WriteResult<{
      idea: IdeaAuthorityDto;
      answer: AnswerDto;
      createdStatementIds: string[];
      openQuestionCount: number;
    }>
  >;
  promoteIdea(
    ideaId: string,
    input: PromoteIdeaRequest,
    context: CommandContext,
  ): Promise<
    WriteResult<{
      idea: IdeaAuthorityDto;
      project: ProjectMutationDto;
    }>
  >;
  listIdeas(
    view: "proposer" | "executor",
    limit: number,
    cursor?: string,
  ): Promise<Page<IdeaSummaryDto>>;
  getIdea(
    ideaId: string,
    view: "proposer" | "executor",
  ): Promise<IdeaDetailDto | null>;
  listProjects(
    view: "proposer" | "executor",
    limit: number,
    cursor?: string,
  ): Promise<Page<ProjectSummaryDto>>;
  getProject(
    projectId: string,
    view: "proposer" | "executor",
  ): Promise<ProjectDetailDto | null>;
}
