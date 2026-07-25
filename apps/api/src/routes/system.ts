import type { FastifyInstance } from 'fastify';
import type { ApiDependencies } from '../types.js';
import type { MetricsRegistry } from '../metrics.js';
import { createInternalAuthenticator } from '../internal-auth.js';

export const registerSystemRoutes = async (
  app: FastifyInstance,
  dependencies: ApiDependencies,
  metrics: MetricsRegistry,
): Promise<void> => {
  app.get('/v1/health', {
    schema: {
      tags: ['system'],
      summary: 'Liveness probe',
      response: {
        200: {
          type: 'object',
          required: ['status', 'service', 'timestamp'],
          properties: {
            status: { type: 'string' },
            service: { type: 'string' },
            timestamp: { type: 'string' },
          },
        },
      },
    },
    handler: async () => ({
      status: 'ok',
      service: 'sufbot-api',
      timestamp: new Date().toISOString(),
    }),
  });

  app.get('/v1/ready', {
    schema: { tags: ['system'], summary: 'Dependency readiness probe' },
    handler: async (_request, reply) => {
      const [database, redis] = await Promise.all([
        dependencies.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
        dependencies.cache.ping(),
      ]);
      const ready = database && redis;
      return reply.status(ready ? 200 : 503).send({
        status: ready ? 'ready' : 'not_ready',
        dependencies: { database, redis },
        timestamp: new Date().toISOString(),
      });
    },
  });

  app.get('/v1/internal/metrics', {
    preHandler: createInternalAuthenticator(dependencies),
    schema: { hide: true },
    handler: async (_request, reply) => {
      const cache = dependencies.cache.metrics;
      metrics.set('sufbot_cache_local_hits', cache.localHits);
      metrics.set('sufbot_cache_redis_hits', cache.redisHits);
      metrics.set('sufbot_cache_misses', cache.misses);
      return reply.type('text/plain; version=0.0.4').send(metrics.render());
    },
  });
};
