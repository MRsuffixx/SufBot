import { getPrismaClient, disconnectPrisma } from '../src/index.js';

const main = async (): Promise<void> => {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined) {
    throw new Error('DATABASE_URL is required to seed the database.');
  }
  const prisma = getPrismaClient(databaseUrl);
  await prisma.featureFlag.upsert({
    where: { key_scopeKey: { key: 'module:general', scopeKey: 'platform' } },
    create: { key: 'module:general', scopeKey: 'platform', enabled: true },
    update: { enabled: true },
  });
  await prisma.featureFlag.upsert({
    where: { key_scopeKey: { key: 'module:moderation', scopeKey: 'platform' } },
    create: { key: 'module:moderation', scopeKey: 'platform', enabled: true },
    update: { enabled: true },
  });
};

main()
  .then(() => disconnectPrisma())
  .catch(async (error: unknown) => {
    console.error(error);
    await disconnectPrisma();
    process.exitCode = 1;
  });

