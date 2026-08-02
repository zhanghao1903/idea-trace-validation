import { ReportSubmissionRouteSchema } from "@idea/contracts";
import Schema from "typebox/schema";

const reportCompiler = Schema.Compile(ReportSubmissionRouteSchema.body);

export const assertStructuredReport = (value: unknown): void => {
  if (!reportCompiler.Check(value)) throw new Error("REPORT_TEMPLATE_INVALID");
};
