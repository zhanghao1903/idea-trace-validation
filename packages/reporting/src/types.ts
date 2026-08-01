import type { StructuredReportV1 } from "@idea/contracts";

export const REPORT_COMPILER_VERSION = "lp03-report-compiler/1" as const;

export interface ReportValidationIssue {
  path: string;
  code: string;
  message: string;
}

export interface ReportValidationFailure {
  ok: false;
  code:
    | "REPORT_SCHEMA_UNSUPPORTED"
    | "REPORT_VALIDATION_FAILED"
    | "REPORT_UNSAFE_CONTENT";
  issues: readonly ReportValidationIssue[];
}

export interface ReportValidationSuccess {
  ok: true;
  document: StructuredReportV1;
}

export type ReportValidationResult =
  ReportValidationFailure | ReportValidationSuccess;

export type SafeInlineToken =
  | { type: "text"; value: string }
  | { type: "strong"; children: readonly SafeInlineToken[] }
  | { type: "emphasis"; children: readonly SafeInlineToken[] }
  | { type: "inline_code"; value: string }
  | { type: "link"; href: string; children: readonly SafeInlineToken[] }
  | { type: "break" };

export type SafeMarkdownBlock =
  | { type: "paragraph"; children: readonly SafeInlineToken[] }
  | {
      type: "list";
      ordered: boolean;
      items: readonly (readonly SafeMarkdownBlock[])[];
    };

export type SafeReportBlock =
  | { id: string; type: "text"; content: readonly SafeMarkdownBlock[] }
  | {
      id: string;
      type: "metrics";
      items: readonly Readonly<Record<string, unknown>>[];
    }
  | {
      id: string;
      type: "list";
      ordered: boolean;
      items: readonly Readonly<Record<string, unknown>>[];
    }
  | {
      id: string;
      type: "table";
      columns: readonly Readonly<Record<string, unknown>>[];
      rows: readonly Readonly<Record<string, unknown>>[];
    }
  | {
      id: string;
      type: "timeline";
      items: readonly Readonly<Record<string, unknown>>[];
    }
  | {
      id: string;
      type: "evidence_refs";
      evidenceIds: readonly string[];
    }
  | {
      id: string;
      type: "action_refs";
      attentionItemIds: readonly string[];
    };

export interface SafeReportSection {
  id: string;
  title: string;
  description: string | null;
  blocks: readonly SafeReportBlock[];
}

export interface SafeReportRenderModel {
  schemaVersion: "1.0";
  locale: string;
  title: string;
  summary: string | null;
  sections: readonly SafeReportSection[];
}
