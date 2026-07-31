import type {
  ExperienceQueryService,
  IdeaService,
  ProjectExecutionService,
  ReportService,
  Readiness,
} from "@idea/application";
import { createIdFactory } from "@idea/application";
import { ErrorEnvelopeSchema } from "@idea/contracts";
import helmet from "@fastify/helmet";
import staticPlugin from "@fastify/static";
import swagger from "@fastify/swagger";
import {
  Type,
  TypeBoxValidatorCompiler,
  type TypeBoxTypeProvider,
} from "@fastify/type-provider-typebox";
import Fastify, { type FastifyInstance } from "fastify";

import type { AppConfig } from "./config.js";
import {
  domainErrorResponse,
  errorEnvelope,
  validationError,
} from "./errors.js";
import { loggerOptions } from "./logger.js";
import { trimJsonStrings } from "./normalize.js";
import { attentionItemRoutes } from "./routes/attention-items.js";
import { clarificationRoutes } from "./routes/clarifications.js";
import { conclusionRoutes } from "./routes/conclusions.js";
import { evidenceRoutes } from "./routes/evidence.js";
import { experienceRoutes } from "./routes/experience.js";
import { healthRoutes } from "./routes/health.js";
import { humanConfirmationRoutes } from "./routes/human-confirmations.js";
import { ideaRoutes } from "./routes/ideas.js";
import { progressUpdateRoutes } from "./routes/progress-updates.js";
import { projectHistoryRoutes } from "./routes/project-history.js";
import { projectTransitionRoutes } from "./routes/project-transitions.js";
import { projectRoutes } from "./routes/projects.js";
import { reportRoutes } from "./routes/reports.js";
import { promotionRoutes } from "./routes/promotions.js";

export interface AppDependencies {
  config: AppConfig;
  service: IdeaService;
  executionService: ProjectExecutionService;
  reportService: ReportService;
  experienceService: ExperienceQueryService;
  readiness: Readiness;
}

export const buildApp = async ({
  config,
  service,
  executionService,
  reportService,
  experienceService,
  readiness,
}: AppDependencies): Promise<FastifyInstance> => {
  const app = Fastify({
    logger: loggerOptions(config),
    bodyLimit: 65_536,
    genReqId: () => createIdFactory().request(),
    ajv: {
      customOptions: {
        allErrors: true,
        coerceTypes: false,
        removeAdditional: false,
        useDefaults: false,
      },
    },
  })
    .withTypeProvider<TypeBoxTypeProvider>()
    .setValidatorCompiler(TypeBoxValidatorCompiler);
  app.decorateRequest("writePrincipal", null);

  app.setErrorHandler(async (error, request, reply) => {
    const candidate =
      typeof error === "object" && error !== null
        ? (error as {
            code?: string;
            message?: string;
            details?: Readonly<Record<string, unknown>>;
            validation?: {
              instancePath: string;
              keyword: string;
              message?: string;
            }[];
          })
        : {};
    const reportRequest = (request.routeOptions.url ?? "").includes(
      "/projects/:projectId/reports",
    );
    if (candidate.code === "FST_ERR_CTP_BODY_TOO_LARGE" && reportRequest) {
      return reply.code(413).send(
        errorEnvelope(request.id, {
          code: "REQUEST_TOO_LARGE",
          message: "The report body exceeds 262144 bytes.",
          retryable: false,
          details: { maxBytes: 262_144, recovery: "REDUCE_REPORT_SIZE" },
        }),
      );
    }
    if (
      reportRequest &&
      (candidate.validation !== undefined ||
        candidate.code === "FST_ERR_CTP_INVALID_JSON_BODY")
    ) {
      const unsupported =
        typeof request.body === "object" &&
        request.body !== null &&
        "schemaVersion" in request.body &&
        request.body.schemaVersion !== "1.0";
      return reply.code(400).send(
        errorEnvelope(request.id, {
          code: unsupported
            ? "REPORT_SCHEMA_UNSUPPORTED"
            : "REPORT_VALIDATION_FAILED",
          message: "The structured report request is invalid.",
          retryable: false,
          details: {
            issues: candidate.validation?.slice(0, 50).map((issue) => ({
              path: issue.instancePath || "/",
              code: `SCHEMA_${issue.keyword.toUpperCase()}`,
              message: issue.message ?? "is invalid",
            })) ?? [
              {
                path: "/",
                code: "JSON_PARSE_INVALID",
                message: "Request body must be valid JSON.",
              },
            ],
            recovery: "FIX_REPORT_AND_RETRY",
          },
        }),
      );
    }
    if (
      candidate.validation !== undefined ||
      candidate.code === "FST_ERR_CTP_BODY_TOO_LARGE"
    ) {
      const issues = candidate.validation?.map((issue) => ({
        path: issue.instancePath || "/",
        keyword: issue.keyword,
        message: issue.message ?? "is invalid",
      })) ?? [
        {
          path: "/",
          keyword: "maxBytes",
          message: "must not exceed 65536 bytes",
        },
      ];
      return reply
        .code(400)
        .send(errorEnvelope(request.id, validationError(issues)));
    }
    if (candidate.message === "INVALID_CURSOR") {
      return reply.code(400).send(
        errorEnvelope(
          request.id,
          validationError([
            {
              path: "/cursor",
              keyword: "format",
              message: "must be a valid opaque cursor",
            },
          ]),
        ),
      );
    }
    const domainError = domainErrorResponse(candidate);
    if (domainError !== undefined) {
      return reply
        .code(domainError.status as 400)
        .send(errorEnvelope(request.id, domainError.error));
    }
    request.log.error({ errorCode: candidate.code }, "request failed");
    return reply.code(500).send(
      errorEnvelope(request.id, {
        code: "INTERNAL_ERROR",
        message: "An unexpected internal error occurred.",
        retryable: true,
        details: { recovery: "RETRY_WITH_SAME_KEY_IF_RESULT_UNKNOWN" },
      }),
    );
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        connectSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
      },
    },
  });
  await app.register(swagger, {
    openapi: {
      info: { title: "Idea Trace Validation LP-03 API", version: "0.3.0" },
      openapi: "3.1.0",
      components: {
        securitySchemes: {
          aiWrite: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "opaque token",
          },
          humanControl: {
            type: "apiKey",
            in: "header",
            name: "X-Human-Control-Token",
          },
          confirmationCapability: {
            type: "apiKey",
            in: "cookie",
            name: "lp02_confirmation",
          },
        },
      },
    },
  });

  await app.register(healthRoutes(readiness));
  app.get(
    "/openapi.json",
    {
      schema: {
        response: { 200: Type.Object({}, { additionalProperties: true }) },
      },
    },
    async () => app.swagger(),
  );

  await app.register(
    async (business) => {
      business.addHook("preValidation", async (request) => {
        const preserveReportWhitespace =
          request.method === "POST" &&
          (request.routeOptions.url ?? "").endsWith(
            "/projects/:projectId/reports",
          );
        if (request.body !== undefined && !preserveReportWhitespace)
          request.body = trimJsonStrings(request.body);
      });
      business.addHook("preHandler", async (request, reply) => {
        const state = await readiness.current(1_000);
        if (state.status !== "READY") {
          await reply.code(503).send(
            errorEnvelope(request.id, {
              code: "SERVICE_NOT_READY",
              message: "The service is not ready to serve business requests.",
              retryable: true,
              details: { reason: state.reason, recovery: "RETRY_LATER" },
            }),
          );
        }
      });
      await business.register(ideaRoutes(service, config.aiApiToken));
      await business.register(clarificationRoutes(service, config.aiApiToken));
      await business.register(promotionRoutes(service, config.aiApiToken));
      await business.register(projectRoutes(service));
      await business.register(
        projectTransitionRoutes(executionService, config.aiApiToken),
      );
      await business.register(
        progressUpdateRoutes(executionService, config.aiApiToken),
      );
      await business.register(
        attentionItemRoutes(executionService, config.aiApiToken),
      );
      await business.register(
        evidenceRoutes(executionService, config.aiApiToken),
      );
      await business.register(
        conclusionRoutes(executionService, config.aiApiToken),
      );
      await business.register(
        humanConfirmationRoutes(executionService, config.humanControlToken),
      );
      await business.register(projectHistoryRoutes(executionService));
      await business.register(
        reportRoutes(reportService, config.aiApiToken, {
          actorType: "AI",
          role: "EXECUTOR",
          displayName: config.aiWriteDisplayName,
          client: config.aiWriteClient,
          onBehalfOfRole: null,
        }),
      );
      await business.register(experienceRoutes(experienceService));
    },
    { prefix: "/api/v1" },
  );

  if (config.webDistDir !== null && config.webDistDir !== undefined) {
    const root = path.resolve(config.webDistDir);
    if (!existsSync(path.join(root, "index.html"))) {
      throw new Error("WEB_DIST_INDEX_MISSING");
    }
    await app.register(staticPlugin, {
      root,
      prefix: "/",
      index: false,
      maxAge: "1y",
      immutable: true,
    });
    const shell = async (
      _request: unknown,
      reply: {
        header(name: string, value: string): unknown;
        sendFile(file: string, options: { cacheControl: boolean }): unknown;
      },
    ) => {
      reply.header("cache-control", "no-cache");
      return reply.sendFile("index.html", { cacheControl: false });
    };
    app.get("/", shell);
    app.get("/proposer", shell);
    app.get("/executor", shell);
    app.get("/proposer/projects/:projectId", shell);
    app.get("/executor/projects/:projectId", shell);
    app.get("/confirmations/:confirmationId", shell);
  }

  void ErrorEnvelopeSchema;
  return app;
};
import { existsSync } from "node:fs";
import path from "node:path";
