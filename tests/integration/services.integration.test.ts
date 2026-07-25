import { Redis } from 'ioredis';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadRootEnvironment } from '@sufbot/config';

loadRootEnvironment();
const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL;
const databaseHost = databaseUrl === undefined ? '' : new URL(databaseUrl).hostname;
const redisHost = redisUrl === undefined ? '' : new URL(redisUrl).hostname;
const runIntegration =
  databaseUrl !== undefined &&
  redisUrl !== undefined &&
  ['127.0.0.1', 'localhost'].includes(databaseHost) &&
  ['127.0.0.1', 'localhost'].includes(redisHost);
const describeServices = runIntegration ? describe : describe.skip;

describeServices('local service integration', () => {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 5_000,
  });
  const redis = new Redis(redisUrl ?? '', {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });

  beforeAll(async () => {
    await redis.connect();
  });

  afterAll(async () => {
    await pool.end();
    redis.disconnect();
  });

  it('connects to PostgreSQL with all migrations applied', async () => {
    const result = await pool.query<{ migration_name: string }>(
      `SELECT "migration_name"
         FROM "_prisma_migrations"
        WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL
        ORDER BY "migration_name"`,
    );
    expect(result.rows.map((row) => row.migration_name)).toEqual([
      '20260725000100_init',
      '20260725000200_platform_bootstrap',
    ]);
  });

  it('connects to Redis and receives PONG', async () => {
    await expect(redis.ping()).resolves.toBe('PONG');
  });
});
