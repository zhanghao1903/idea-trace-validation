import type {
  ReportCurrentDto,
  ReportRevisionDto,
  ReportRevisionSummaryDto,
  ReportSubmissionResultDto,
  SafeReportRenderModelDto,
  StructuredReportV1,
} from "@idea/contracts";

import type { ReportWriteContext } from "../report-write-context.js";
import type { Page, WriteResult } from "./idea-service.js";

export interface ValidatedReportSubmission {
  readonly document: StructuredReportV1;
  readonly renderModel: SafeReportRenderModelDto;
  readonly contentSha256: string;
}

export interface ReportService {
  submitReport(
    projectId: string,
    submission: Readonly<ValidatedReportSubmission>,
    context: Readonly<ReportWriteContext>,
  ): Promise<WriteResult<ReportSubmissionResultDto>>;
  getCurrentReport(projectId: string): Promise<ReportCurrentDto>;
  listReportRevisions(
    projectId: string,
    limit: number,
    cursor?: string,
  ): Promise<Page<ReportRevisionSummaryDto>>;
  getReportRevision(
    projectId: string,
    revision: number,
  ): Promise<ReportRevisionDto | null>;
}
