import { Redis } from 'ioredis';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getSafeLocalTestDatabaseUrl, getSafeLocalTestRedisUrl } from './environment.js';

const databaseUrl = getSafeLocalTestDatabaseUrl();
const redisUrl = getSafeLocalTestRedisUrl();
const runIntegration = databaseUrl !== undefined && redisUrl !== undefined;
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
      '20260727000100_discord_installation_state',
      '20260728000100_billing_foundation',
      '20260728000200_billing_financial_event_identity',
      '20260728000300_billing_event_transaction_identity',
      '20260728000400_billing_notifications',
      '20260728000500_billing_risk_blocks',
      '20260728000600_billing_risk_block_actors',
      '20260728221648',
      '20260729000100_onboarding_foundation',
    ]);
  });

  it('connects to Redis and receives PONG', async () => {
    await expect(redis.ping()).resolves.toBe('PONG');
  });
});
