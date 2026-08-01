import { compileSafeMarkdown } from "./markdown.js";
import { validateReportSchema } from "./schema.js";
import type { ReportValidationIssue, ReportValidationResult } from "./types.js";

const MAX_ISSUES = 50;

const blankIssue = (
  value: string | undefined,
  path: string,
  issues: ReportValidationIssue[],
): void => {
  if (value !== undefined && value.trim().length === 0) {
    issues.push({
      path,
      code: "BLANK_STRING",
      message: "Required display text must contain a non-whitespace character.",
    });
  }
};

const sortedIssues = (
  issues: readonly ReportValidationIssue[],
): readonly ReportValidationIssue[] =>
  [...issues]
    .sort((left, right) =>
      left.path === right.path
        ? left.code.localeCompare(right.code)
        : left.path.localeCompare(right.path),
    )
    .filter(
      (issue, index, all) =>
        index === 0 ||
        issue.path !== all[index - 1]?.path ||
        issue.code !== all[index - 1]?.code,
    )
    .slice(0, MAX_ISSUES);

export const validateStructuredReport = (
  value: unknown,
): ReportValidationResult => {
  if (
    typeof value === "object" &&
    value !== null &&
    "schemaVersion" in value &&
    value.schemaVersion !== "1.0"
  ) {
    return {
      ok: false,
      code: "REPORT_SCHEMA_UNSUPPORTED",
      issues: [
        {
          path: "/schemaVersion",
          code: "SCHEMA_VERSION_UNSUPPORTED",
          message: "Only structured report schemaVersion 1.0 is supported.",
        },
      ],
    };
  }

  const structural = validateReportSchema(value);
  if (structural.document === null) {
    return {
      ok: false,
      code: "REPORT_VALIDATION_FAILED",
      issues: sortedIssues(structural.issues),
    };
  }

  const issues: ReportValidationIssue[] = [];
  const ids = new Set<string>();
  const registerId = (id: string, path: string): void => {
    if (ids.has(id)) {
      issues.push({
        path,
        code: "DUPLICATE_REPORT_ID",
        message: "IDs must be unique within a report.",
      });
    }
    ids.add(id);
  };

  blankIssue(structural.document.title, "/title", issues);
  blankIssue(structural.document.summary, "/summary", issues);
  blankIssue(structural.document.generator?.name, "/generator/name", issues);
  blankIssue(
    structural.document.generator?.version,
    "/generator/version",
    issues,
  );

  structural.document.sections.forEach((section, sectionIndex) => {
    const sectionPath = `/sections/${sectionIndex}`;
    registerId(section.id, `${sectionPath}/id`);
    blankIssue(section.title, `${sectionPath}/title`, issues);
    blankIssue(section.description, `${sectionPath}/description`, issues);
    section.blocks.forEach((block, blockIndex) => {
      const blockPath = `${sectionPath}/blocks/${blockIndex}`;
      registerId(block.id, `${blockPath}/id`);
      if (block.type === "text") {
        blankIssue(block.markdown, `${blockPath}/markdown`, issues);
        try {
          compileSafeMarkdown(block.markdown);
        } catch (error) {
          issues.push({
            path: `${blockPath}/markdown`,
            code:
              error instanceof Error && "code" in error
                ? String(error.code)
                : "MARKDOWN_UNSAFE",
            message:
              error instanceof Error ? error.message : "Markdown is unsafe.",
          });
        }
      }
      if (
        block.type === "metrics" ||
        block.type === "list" ||
        block.type === "timeline"
      ) {
        block.items.forEach((item, itemIndex) =>
          registerId(item.id, `${blockPath}/items/${itemIndex}/id`),
        );
      }
      if (block.type === "metrics") {
        block.items.forEach((item, itemIndex) => {
          const itemPath = `${blockPath}/items/${itemIndex}`;
          blankIssue(item.label, `${itemPath}/label`, issues);
          if (typeof item.value === "string") {
            blankIssue(item.value, `${itemPath}/value`, issues);
          }
          blankIssue(item.unit, `${itemPath}/unit`, issues);
          blankIssue(item.note, `${itemPath}/note`, issues);
          if (typeof item.value === "number" && !Number.isFinite(item.value)) {
            issues.push({
              path: `${itemPath}/value`,
              code: "METRIC_NOT_FINITE",
              message: "Metric numbers must be finite.",
            });
          }
        });
      }
      if (block.type === "list") {
        block.items.forEach((item, itemIndex) =>
          blankIssue(item.text, `${blockPath}/items/${itemIndex}/text`, issues),
        );
      }
      if (block.type === "table") {
        const columnKeys = block.columns.map((column) => column.key).sort();
        block.columns.forEach((column, columnIndex) => {
          registerId(column.key, `${blockPath}/columns/${columnIndex}/key`);
          blankIssue(
            column.label,
            `${blockPath}/columns/${columnIndex}/label`,
            issues,
          );
        });
        block.rows.forEach((row, rowIndex) => {
          registerId(row.id, `${blockPath}/rows/${rowIndex}/id`);
          const cellKeys = Object.keys(row.cells).sort();
          if (
            cellKeys.length !== columnKeys.length ||
            cellKeys.some((key, index) => key !== columnKeys[index])
          ) {
            issues.push({
              path: `${blockPath}/rows/${rowIndex}/cells`,
              code: "TABLE_CELLS_MISMATCH",
              message:
                "Table row cells must exactly match the declared column keys.",
            });
          }
          Object.entries(row.cells).forEach(([key, value]) => {
            if (typeof value === "number" && !Number.isFinite(value)) {
              issues.push({
                path: `${blockPath}/rows/${rowIndex}/cells/${key}`,
                code: "TABLE_NUMBER_NOT_FINITE",
                message: "Table numbers must be finite.",
              });
            }
          });
        });
      }
      if (block.type === "timeline") {
        block.items.forEach((item, itemIndex) => {
          blankIssue(
            item.title,
            `${blockPath}/items/${itemIndex}/title`,
            issues,
          );
          blankIssue(
            item.description,
            `${blockPath}/items/${itemIndex}/description`,
            issues,
          );
        });
      }
    });
  });

  if (issues.length > 0) {
    const unsafe = issues.some((issue) => issue.code.startsWith("MARKDOWN_"));
    return {
      ok: false,
      code: unsafe ? "REPORT_UNSAFE_CONTENT" : "REPORT_VALIDATION_FAILED",
      issues: sortedIssues(issues),
    };
  }

  return { ok: true, document: structural.document };
};
