import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from './src/client.js';
import { seedDatabase } from './src/seed-data.js';

const candidateUrl = process.env.TEST_DATABASE_URL;
const parsedCandidate = (() => {
  if (candidateUrl === undefined) return undefined;
  try {
    return new URL(candidateUrl);
  } catch {
    return undefined;
  }
})();
const databaseName = parsedCandidate?.pathname.replace(/^\/+/, '').toLowerCase() ?? '';
const runIntegration =
  parsedCandidate !== undefined &&
  ['127.0.0.1', '::1', 'localhost'].includes(parsedCandidate.hostname.toLowerCase()) &&
  /(?:^|[_-])test(?:$|[_-])/.test(databaseName);
const describeDatabase = runIntegration ? describe : describe.skip;
const prisma =
  runIntegration && candidateUrl !== undefined ? createPrismaClient(candidateUrl) : undefined;
const client = () => {
  if (prisma === undefined) throw new Error('SAFE_LOCAL_TEST_DATABASE_REQUIRED');
  return prisma;
};

describeDatabase('database integration', () => {
  beforeAll(async () => {
    await client().$connect();
  });

  afterAll(async () => {
    await client().$disconnect();
  });

  it('connects and finds the migration-managed schema', async () => {
    const result = await client().$queryRaw<Array<{ database_name: string }>>`
      SELECT current_database() AS database_name
    `;
    expect(result[0]?.database_name).toBeTruthy();
    await expect(client().guild.count()).resolves.toBeGreaterThanOrEqual(0);
  });

  it('seeds required records idempotently', async () => {
    await seedDatabase(client());
    await seedDatabase(client());

    await expect(
      client().featureFlag.count({
        where: { scopeKey: 'platform', key: { startsWith: 'module:' } },
      }),
    ).resolves.toBe(5);
    await expect(client().moduleDefinition.count()).resolves.toBe(5);
    await expect(client().localeDefinition.count()).resolves.toBe(2);
    await expect(
      client().platformConfiguration.count({ where: { key: 'defaults' } }),
    ).resolves.toBe(1);
  });
});
