import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createInternalAuthenticator } from '../internal-auth.js';
import type { ApiDependencies } from '../types.js';

const InvalidationInputSchema = z.object({
  type: z.literal('guild.config.updated'),
  guildId: z.string().regex(/^\d{17,20}$/),
  module: z.string().min(1).max(64).optional(),
  version: z.number().int().positive(),
  timestamp: z.iso.datetime(),
});

export const registerInternalRoutes = async (
  app: FastifyInstance,
  dependencies: ApiDependencies,
): Promise<void> => {
  app.post('/v1/internal/config-invalidation', {
    preHandler: createInternalAuthenticator(dependencies),
    schema: { hide: true },
    handler: async (request) => {
      const event = InvalidationInputSchema.parse(request.body);
      await dependencies.cache.publish(event);
      return { success: true, requestId: request.id };
    },
  });
};

