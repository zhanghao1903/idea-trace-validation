import type { ProjectExecutionService } from "@idea/application";
import { ProjectHistoryCollectionRouteSchema } from "@idea/contracts";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";

export const projectHistoryRoutes =
  (service: ProjectExecutionService): FastifyPluginAsyncTypebox =>
  async (app) => {
    app.get(
      "/projects/:projectId/history",
      { schema: ProjectHistoryCollectionRouteSchema },
      async (request) => {
        const page = await service.listProjectHistory(
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
  };
