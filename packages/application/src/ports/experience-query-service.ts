import type {
  ExecutorProjectCardDto,
  ExecutorProjectGroup,
  ExperienceProjectDetailDto,
  ExperienceView,
  ProposerIdeaCardDto,
  ProposerIdeaCategory,
} from "@idea/contracts";

import type { Page } from "./idea-service.js";

export interface ExperienceQueryService {
  listProposerIdeas(
    category: ProposerIdeaCategory | undefined,
    limit: number,
    cursor?: string,
  ): Promise<Page<ProposerIdeaCardDto>>;

  listExecutorProjects(
    group: ExecutorProjectGroup | undefined,
    limit: number,
    cursor?: string,
  ): Promise<Page<ExecutorProjectCardDto>>;

  getProjectExperience(
    projectId: string,
    view: ExperienceView,
  ): Promise<ExperienceProjectDetailDto | null>;
}
