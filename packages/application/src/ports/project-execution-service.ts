import type {
  AttentionEventDto,
  AttentionEventRequest,
  AttentionEffectiveResponse,
  AttentionItemDto,
  AttentionItemHistoryDto,
  AttentionStatus,
  AttentionType,
  ConclusionDto,
  ConfirmationDecisionRequest,
  CreateAttentionItemRequest,
  CreateConclusionRequest,
  CreateConfirmationRequest,
  CreateEvidenceRequest,
  CreateProgressUpdateRequest,
  EvidenceCorrectionRequest,
  EvidenceDto,
  EvidenceEventDto,
  EvidenceHistoryDto,
  HumanConfirmationSummaryDto,
  ProgressUpdateDto,
  ProjectAuthorityDto,
  ProjectHistoryItemDto,
  ProjectTransitionDto,
  ProjectTransitionRequest,
} from "@idea/contracts";

import type { CommandContext, Page, WriteResult } from "./idea-service.js";

export type ConfirmationCreationResult =
  | (Extract<
      WriteResult<{
        project: ProjectAuthorityDto;
        confirmation: HumanConfirmationSummaryDto;
      }>,
      { ok: true }
    > & { capability: string })
  | Extract<
      WriteResult<{
        project: ProjectAuthorityDto;
        confirmation: HumanConfirmationSummaryDto;
      }>,
      { ok: false }
    >;

export interface ProjectExecutionService {
  transitionProject(
    projectId: string,
    input: ProjectTransitionRequest,
    context: CommandContext,
  ): Promise<
    WriteResult<{
      project: ProjectAuthorityDto;
      transition: ProjectTransitionDto;
    }>
  >;
  createProgressUpdate(
    projectId: string,
    input: CreateProgressUpdateRequest,
    context: CommandContext,
  ): Promise<
    WriteResult<{
      project: ProjectAuthorityDto;
      progressUpdate: ProgressUpdateDto;
    }>
  >;
  listProgressUpdates(
    projectId: string,
    limit: number,
    cursor?: string,
  ): Promise<Page<ProgressUpdateDto>>;
  createAttentionItem(
    projectId: string,
    input: CreateAttentionItemRequest,
    context: CommandContext,
  ): Promise<
    WriteResult<{
      project: ProjectAuthorityDto;
      attentionItem: AttentionItemDto;
    }>
  >;
  appendAttentionEvent(
    projectId: string,
    itemId: string,
    input: AttentionEventRequest,
    context: CommandContext,
  ): Promise<
    WriteResult<{
      project: ProjectAuthorityDto;
      attentionItem: AttentionItemDto;
      event: AttentionEventDto;
      effectiveResponse: AttentionEffectiveResponse | null;
    }>
  >;
  listAttentionItems(
    projectId: string,
    limit: number,
    cursor?: string,
    filters?: { type?: AttentionType; status?: AttentionStatus },
  ): Promise<Page<AttentionItemHistoryDto>>;
  createEvidence(
    projectId: string,
    input: CreateEvidenceRequest,
    context: CommandContext,
  ): Promise<
    WriteResult<{ project: ProjectAuthorityDto; evidence: EvidenceDto }>
  >;
  correctEvidence(
    projectId: string,
    evidenceId: string,
    input: EvidenceCorrectionRequest,
    context: CommandContext,
  ): Promise<
    WriteResult<{
      project: ProjectAuthorityDto;
      evidence: EvidenceDto;
      event: EvidenceEventDto;
    }>
  >;
  listEvidence(
    projectId: string,
    limit: number,
    cursor?: string,
  ): Promise<Page<EvidenceHistoryDto>>;
  createConclusion(
    projectId: string,
    input: CreateConclusionRequest,
    context: CommandContext,
  ): Promise<
    WriteResult<{ project: ProjectAuthorityDto; conclusion: ConclusionDto }>
  >;
  listConclusions(
    projectId: string,
    limit: number,
    cursor?: string,
  ): Promise<Page<ConclusionDto>>;
  listProjectHistory(
    projectId: string,
    limit: number,
    cursor?: string,
  ): Promise<Page<ProjectHistoryItemDto>>;
  createConfirmation(
    projectId: string,
    input: CreateConfirmationRequest,
    context: CommandContext,
  ): Promise<ConfirmationCreationResult>;
  decideConfirmation(
    confirmationId: string,
    capability: string,
    input: ConfirmationDecisionRequest,
    context: CommandContext,
  ): Promise<
    WriteResult<{
      project: ProjectAuthorityDto;
      confirmation: HumanConfirmationSummaryDto;
      conclusion: ConclusionDto | null;
      transition: ProjectTransitionDto | null;
    }>
  >;
  getConfirmation(
    confirmationId: string,
  ): Promise<HumanConfirmationSummaryDto | null>;
  validateConfirmationCapability(
    confirmationId: string,
    capability: string,
  ): Promise<boolean>;
}
