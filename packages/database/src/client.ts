import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

type GlobalPrismaState = typeof globalThis & {
  __sufbotPrisma: PrismaClient | undefined;
  __sufbotPrismaUrl: string | undefined;
};

const globalState = globalThis as GlobalPrismaState;

export const createPrismaClient = (databaseUrl: string): PrismaClient => {
  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    max: 10,
  });
  return new PrismaClient({ adapter });
};

export const getPrismaClient = (databaseUrl = process.env.DATABASE_URL): PrismaClient => {
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new TypeError('DATABASE_URL is required before creating the Prisma client.');
  }
  if (globalState.__sufbotPrisma !== undefined) {
    if (globalState.__sufbotPrismaUrl !== databaseUrl) {
      throw new TypeError('Prisma was already initialized with a different database URL.');
    }
    return globalState.__sufbotPrisma;
  }
  const client = createPrismaClient(databaseUrl);
  globalState.__sufbotPrisma = client;
  globalState.__sufbotPrismaUrl = databaseUrl;
  return client;
};

export const disconnectPrisma = async (): Promise<void> => {
  if (globalState.__sufbotPrisma !== undefined) {
    await globalState.__sufbotPrisma.$disconnect();
    globalState.__sufbotPrisma = undefined;
    globalState.__sufbotPrismaUrl = undefined;
  }
};
