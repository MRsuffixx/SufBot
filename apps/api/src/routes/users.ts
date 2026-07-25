import type { FastifyInstance } from 'fastify';
import { AuthenticationError } from '@sufbot/shared';
import { createApiKeyAuthenticator } from '../authentication.js';
import type { ApiDependencies } from '../types.js';

export const registerUserRoutes = async (
  app: FastifyInstance,
  dependencies: ApiDependencies,
): Promise<void> => {
  app.get('/v1/users/me', {
    preHandler: createApiKeyAuthenticator(dependencies),
    schema: { tags: ['users'], security: [{ apiKey: [] }] },
    handler: async (request) => {
      const context = request.authContext;
      if (context === undefined) throw new AuthenticationError();
      const user = await dependencies.prisma.user.findUniqueOrThrow({
        where: { id: context.userId },
        select: {
          id: true,
          discordId: true,
          displayName: true,
          avatarHash: true,
          platformRole: true,
          createdAt: true,
        },
      });
      return { success: true, data: user, requestId: request.id };
    },
  });
};

