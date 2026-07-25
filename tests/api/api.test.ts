import { describe, expect, it } from 'vitest';
import { loadAppConfig, type ApiEnvironment } from '@sufbot/config';
import { createLogger } from '@sufbot/logger';
import type { DistributedCache } from '@sufbot/cache';
import type { PrismaClient } from '@sufbot/database/generated';
import { buildApi } from '../../apps/api/src/app.js';

const config = loadAppConfig({ environment: 'test', reload: true });
const env: ApiEnvironment = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://sufbot:test@localhost:5432/sufbot_test',
  REDIS_URL: 'redis://localhost:6379/1',
  INTERNAL_API_SECRET: 'i'.repeat(32),
  WEBHOOK_SIGNING_SECRET: 'w'.repeat(32),
};

const createDependencies = () => ({
  config: {
    ...config,
    security: {
      ...config.security,
      rateLimits: { ...config.security.rateLimits, enabled: false },
    },
  },
  env,
  prisma: {} as PrismaClient,
  cache: {
    metrics: { localHits: 0, redisHits: 0, misses: 0, loadErrors: 0 },
    ping: () => Promise.resolve(true),
  } as unknown as DistributedCache,
  logger: createLogger({ app: 'test', environment: 'test' }, { level: 'silent' }),
});

describe('Fastify API boundary', () => {
  it('returns a minimal liveness response', async () => {
    const app = await buildApi(createDependencies());
    const response = await app.inject({ method: 'GET', url: '/v1/health' });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-request-id']).toMatch(/^req_[a-f0-9]{32}$/);
    expect(response.json()).toMatchObject({
      status: 'ok',
      service: 'sufbot-api',
    });
  });

  it('rejects unauthenticated public API access with a safe envelope', async () => {
    const app = await buildApi(createDependencies());
    const response = await app.inject({ method: 'GET', url: '/v1/users/me' });
    await app.close();

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: 'AUTHENTICATION_REQUIRED' },
    });
  });

  it('does not disclose unknown internal routes', async () => {
    const app = await buildApi(createDependencies());
    const response = await app.inject({
      method: 'GET',
      url: '/v1/internal/does-not-exist',
    });
    await app.close();

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: 'ROUTE_NOT_FOUND' },
    });
  });

  it('reports dependency unavailability without claiming readiness', async () => {
    const dependencies = createDependencies();
    dependencies.prisma = {
      $queryRaw: () => Promise.reject(new Error('database unavailable')),
    } as unknown as PrismaClient;
    dependencies.cache = {
      metrics: { localHits: 0, redisHits: 0, misses: 0, loadErrors: 0 },
      ping: () => Promise.resolve(false),
    } as unknown as DistributedCache;
    const app = await buildApi(dependencies);
    const response = await app.inject({ method: 'GET', url: '/v1/ready' });
    await app.close();

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      status: 'not_ready',
      dependencies: { database: false, redis: false },
    });
  });
});
