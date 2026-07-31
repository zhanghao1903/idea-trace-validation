import type { IdeaService } from "@idea/application";
import {
  ProjectDetailRouteSchema,
  ProjectListRouteSchema,
} from "@idea/contracts";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";

import { errorEnvelope, notFoundError } from "../errors.js";

export const projectRoutes =
  (service: IdeaService): FastifyPluginAsyncTypebox =>
  async (app) => {
    app.get(
      "/projects",
      { schema: ProjectListRouteSchema },
      async (request) => {
        const view = request.query.view ?? "proposer";
        const limit = request.query.limit ?? 20;
        const result = await service.listProjects(
          view,
          limit,
          request.query.cursor,
        );
        return {
          ok: true as const,
          data: {
            items: result.items,
            page: { limit: result.limit, nextCursor: result.nextCursor },
            view,
          },
          meta: { requestId: request.id },
        };
      },
    );

    app.get(
      "/projects/:projectId",
      { schema: ProjectDetailRouteSchema },
      async (request, reply) => {
        const view = request.query.view ?? "proposer";
        const project = await service.getProject(
          request.params.projectId,
          view,
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
          data: { project, view },
          meta: { requestId: request.id },
        };
      },
    );
  };
