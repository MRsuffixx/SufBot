import { disconnectPrisma, getPrismaClient, seedDatabase } from '../src/index.js';
import { loadDatabaseEnvironment } from '../environment.js';

const main = async (): Promise<void> => {
  const environment = loadDatabaseEnvironment();
  const prisma = getPrismaClient(environment.databaseUrl);
  await seedDatabase(prisma);
};

main()
  .then(() => disconnectPrisma())
  .catch(async (error: unknown) => {
    console.error(error);
    await disconnectPrisma();
    process.exitCode = 1;
  });
