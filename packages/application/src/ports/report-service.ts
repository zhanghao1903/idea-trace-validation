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

type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

export interface ValidatedReportSubmission {
  readonly document: StructuredReportV1;
  readonly renderModel: DeepReadonly<SafeReportRenderModelDto>;
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
