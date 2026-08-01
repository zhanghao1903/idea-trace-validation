import type { ExperienceQueryService } from "@idea/application";
import {
  ExecutorExperienceRouteSchema,
  ExperienceProjectRouteSchema,
  ProposerExperienceRouteSchema,
} from "@idea/contracts";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";

import { errorEnvelope, notFoundError } from "../errors.js";

export const experienceRoutes = (
  service: ExperienceQueryService,
): FastifyPluginAsyncTypebox =>
  async function routes(app) {
    app.get(
      "/experience/proposer/ideas",
      { schema: ProposerExperienceRouteSchema },
      async (request) => {
        const page = await service.listProposerIdeas(
          request.query.category,
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
      "/experience/executor/projects",
      { schema: ExecutorExperienceRouteSchema },
      async (request) => {
        const page = await service.listExecutorProjects(
          request.query.group,
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
      "/experience/projects/:projectId",
      { schema: ExperienceProjectRouteSchema },
      async (request, reply) => {
        const project = await service.getProjectExperience(
          request.params.projectId,
          request.query.view,
        );
        if (project === null) {
          return reply
            .code(404)
            .send(
              errorEnvelope(
                request.id,
                notFoundError("PROJECT", request.params.projectId),
              ),
            );
        }
        return {
          ok: true as const,
          data: project,
          meta: { requestId: request.id },
        };
      },
    );
  };
