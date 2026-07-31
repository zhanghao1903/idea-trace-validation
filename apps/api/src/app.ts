import type {
  IdeaService,
  ProjectExecutionService,
  Readiness,
} from "@idea/application";
import { createIdFactory } from "@idea/application";
import { ErrorEnvelopeSchema } from "@idea/contracts";
import helmet from "@fastify/helmet";
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
import { healthRoutes } from "./routes/health.js";
import { humanConfirmationRoutes } from "./routes/human-confirmations.js";
import { ideaRoutes } from "./routes/ideas.js";
import { progressUpdateRoutes } from "./routes/progress-updates.js";
import { projectHistoryRoutes } from "./routes/project-history.js";
import { projectTransitionRoutes } from "./routes/project-transitions.js";
import { projectRoutes } from "./routes/projects.js";
import { promotionRoutes } from "./routes/promotions.js";

export interface AppDependencies {
  config: AppConfig;
  service: IdeaService;
  executionService: ProjectExecutionService;
  readiness: Readiness;
}

export const buildApp = async ({
  config,
  service,
  executionService,
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

  await app.register(helmet);
  await app.register(swagger, {
    openapi: {
      info: { title: "Idea Trace Validation LP-02 API", version: "0.2.0" },
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
        if (request.body !== undefined)
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
    },
    { prefix: "/api/v1" },
  );

  void ErrorEnvelopeSchema;
  return app;
};
