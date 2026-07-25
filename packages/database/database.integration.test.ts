import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadDatabaseEnvironment } from './environment.js';
import { createPrismaClient } from './src/client.js';
import { seedDatabase } from './src/seed-data.js';

const environment = loadDatabaseEnvironment();
const databaseHost = new URL(environment.databaseUrl).hostname;
const runIntegration = ['127.0.0.1', 'localhost'].includes(databaseHost);
const describeDatabase = runIntegration ? describe : describe.skip;
const prisma = createPrismaClient(environment.databaseUrl);

describeDatabase('database integration', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('connects and finds the migration-managed schema', async () => {
    const result = await prisma.$queryRaw<Array<{ database_name: string }>>`
      SELECT current_database() AS database_name
    `;
    expect(result[0]?.database_name).toBeTruthy();
    await expect(prisma.guild.count()).resolves.toBeGreaterThanOrEqual(0);
  });

  it('seeds required records idempotently', async () => {
    await seedDatabase(prisma);
    await seedDatabase(prisma);

    await expect(
      prisma.featureFlag.count({
        where: { scopeKey: 'platform', key: { startsWith: 'module:' } },
      }),
    ).resolves.toBe(5);
    await expect(prisma.moduleDefinition.count()).resolves.toBe(5);
    await expect(prisma.localeDefinition.count()).resolves.toBe(2);
    await expect(prisma.platformConfiguration.count({ where: { key: 'defaults' } })).resolves.toBe(
      1,
    );
  });
});
