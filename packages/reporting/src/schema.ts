import type { Ajv2020 as Ajv2020Class, ErrorObject } from "ajv/dist/2020.js";
import Ajv2020Import from "ajv/dist/2020.js";
import addFormatsImport from "ajv-formats";
import type { FormatsPlugin } from "ajv-formats";

import {
  structuredReportV1Schema,
  type StructuredReportV1,
} from "@idea/contracts";

import type { ReportValidationIssue } from "./types.js";

const Ajv2020 = Ajv2020Import as unknown as typeof Ajv2020Class;
const addFormats = addFormatsImport as unknown as FormatsPlugin;

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  // JSON transport cannot represent non-finite values, but direct callers can.
  // Keep this structural gate permissive for numbers so the semantic gate emits
  // the stable METRIC/TABLE_NOT_FINITE diagnostics promised by the contract.
  strictNumbers: false,
  validateFormats: true,
});
addFormats(ajv);

const validateSchema = ajv.compile<StructuredReportV1>(
  structuredReportV1Schema,
);

const pointerPart = (value: string): string =>
  value.replaceAll("~", "~0").replaceAll("/", "~1");

const issuePath = (error: ErrorObject): string => {
  if (error.keyword === "required") {
    const missing = (error.params as { missingProperty: string })
      .missingProperty;
    return `${error.instancePath}/${pointerPart(missing)}`;
  }
  if (error.keyword === "additionalProperties") {
    const property = (error.params as { additionalProperty: string })
      .additionalProperty;
    return `${error.instancePath}/${pointerPart(property)}`;
  }
  return error.instancePath === "" ? "/" : error.instancePath;
};

export const validateReportSchema = (
  value: unknown,
):
  | { document: StructuredReportV1; issues: null }
  | { document: null; issues: ReportValidationIssue[] } => {
  if (validateSchema(value)) return { document: value, issues: null };
  return {
    document: null,
    issues: (validateSchema.errors ?? []).map((error: ErrorObject) => ({
      path: issuePath(error),
      code: `SCHEMA_${error.keyword.toUpperCase()}`,
      message: error.message ?? "Schema validation failed.",
    })),
  };
};
