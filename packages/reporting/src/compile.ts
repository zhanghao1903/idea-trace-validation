import type { StructuredReportV1 } from "@idea/contracts";

import { compileSafeMarkdown } from "./markdown.js";
import type { SafeReportBlock, SafeReportRenderModel } from "./types.js";

type SourceBlock = StructuredReportV1["sections"][number]["blocks"][number];

const freeze = <T>(value: T): Readonly<T> => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

const immutableRecords = <T extends object>(
  items: readonly T[],
): readonly Readonly<T>[] => items.map((item) => Object.freeze({ ...item }));

const compileBlock = (block: SourceBlock): SafeReportBlock => {
  switch (block.type) {
    case "text":
      return {
        id: block.id,
        type: "text",
        content: compileSafeMarkdown(block.markdown),
      };
    case "metrics":
      return {
        id: block.id,
        type: "metrics",
        items: immutableRecords(block.items),
      };
    case "list":
      return {
        id: block.id,
        type: "list",
        ordered: block.ordered,
        items: immutableRecords(block.items),
      };
    case "table":
      return {
        id: block.id,
        type: "table",
        columns: immutableRecords(block.columns),
        rows: block.rows.map((row) =>
          Object.freeze({ ...row, cells: Object.freeze({ ...row.cells }) }),
        ),
      };
    case "timeline":
      return {
        id: block.id,
        type: "timeline",
        items: immutableRecords(block.items),
      };
    case "evidence_refs":
      return {
        id: block.id,
        type: "evidence_refs",
        evidenceIds: [...block.evidenceIds],
      };
    case "action_refs":
      return {
        id: block.id,
        type: "action_refs",
        attentionItemIds: [...block.attentionItemIds],
      };
  }
};

export const compileReportView = (
  document: StructuredReportV1,
): SafeReportRenderModel =>
  freeze({
    schemaVersion: "1.0" as const,
    locale: document.locale,
    title: document.title,
    summary: document.summary ?? null,
    sections: document.sections.map((section) => ({
      id: section.id,
      title: section.title,
      description: section.description ?? null,
      blocks: section.blocks.map(compileBlock),
    })),
  });
