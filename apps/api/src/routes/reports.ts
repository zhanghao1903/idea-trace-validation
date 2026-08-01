import type { ReportService, WritePrincipal } from "@idea/application";
import {
  ReportCurrentRouteSchema,
  ReportHistoryRouteSchema,
  ReportRevisionRouteSchema,
  ReportSubmissionRouteSchema,
} from "@idea/contracts";
import {
  compileReportView,
  reportContentDigest,
  validateStructuredReport,
} from "@idea/reporting";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";

import { authenticateWrite } from "../authenticate-write.js";
import { errorEnvelope } from "../errors.js";

const reportError = (
  code:
    | "REPORT_SCHEMA_UNSUPPORTED"
    | "REPORT_VALIDATION_FAILED"
    | "REPORT_UNSAFE_CONTENT",
  issues: readonly { path: string; code: string; message: string }[],
) => ({
  code,
  message: "The structured report is invalid.",
  retryable: false,
  details: { issues, recovery: "FIX_REPORT_AND_RETRY" },
});

export const reportRoutes = (
  service: ReportService,
  aiApiToken: string,
  principal: Readonly<WritePrincipal>,
): FastifyPluginAsyncTypebox =>
  async function routes(app) {
    app.post(
      "/projects/:projectId/reports",
      {
        bodyLimit: 262_144,
        schema: ReportSubmissionRouteSchema,
        preHandler: authenticateWrite(aiApiToken, principal),
      },
      async (request, reply) => {
        const validation = validateStructuredReport(request.body);
        if (!validation.ok) {
          return reply
            .code(400)
            .send(
              errorEnvelope(
                request.id,
                reportError(validation.code, validation.issues),
              ),
            );
        }
        if (request.writePrincipal === null) {
          throw new Error("REPORT_WRITE_PRINCIPAL_MISSING");
        }
        const result = await service.submitReport(
          request.params.projectId,
          {
            document: validation.document,
            renderModel: compileReportView(validation.document),
            contentSha256: reportContentDigest(validation.document),
          },
          {
            principal: request.writePrincipal,
            requestId: request.id,
            idempotencyKey: request.headers["idempotency-key"],
          },
        );
        if (!result.ok) {
          return reply
            .code(result.status as 400)
            .send(errorEnvelope(result.requestId, result.error));
        }
        return reply.code(201).send({
          ok: true,
          data: result.data,
          meta: {
            requestId: result.requestId,
            idempotentReplay: result.idempotentReplay,
          },
        });
      },
    );

    app.get(
      "/projects/:projectId/reports/current",
      { schema: ReportCurrentRouteSchema },
      async (request) => ({
        ok: true as const,
        data: await service.getCurrentReport(request.params.projectId),
        meta: { requestId: request.id },
      }),
    );
    app.get(
      "/projects/:projectId/reports",
      { schema: ReportHistoryRouteSchema },
      async (request) => {
        const page = await service.listReportRevisions(
          request.params.projectId,
          request.query.limit ?? 20,
          request.query.cursor,
        );
        return {
          ok: true as const,
          data: {
            items: page.items,
            page: { limit: page.limit, nextCursor: page.nextCursor },
          },
          meta: { requestId: request.id },
        };
      },
    );
    app.get(
      "/projects/:projectId/reports/:revision",
      { schema: ReportRevisionRouteSchema },
      async (request, reply) => {
        const revision = await service.getReportRevision(
          request.params.projectId,
          request.params.revision,
        );
        if (revision === null) {
          return reply.code(404).send(
            errorEnvelope(request.id, {
              code: "REPORT_REVISION_NOT_FOUND",
              message: "The report revision was not found.",
              retryable: false,
              details: {
                recovery: "VERIFY_REVISION_AND_REFETCH",
              },
            }),
          );
        }
        return {
          ok: true as const,
          data: revision,
          meta: { requestId: request.id },
        };
      },
    );
  };
