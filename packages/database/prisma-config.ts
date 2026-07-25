import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';
import { loadDatabaseEnvironment } from './environment.js';

const packageDirectory = dirname(fileURLToPath(import.meta.url));

export const createPrismaConfig = (options?: {
  environment?: NodeJS.ProcessEnv;
  rootDirectory?: string;
}) => {
  const environment = loadDatabaseEnvironment(options);
  return defineConfig({
    schema: join(packageDirectory, 'prisma', 'schema.prisma'),
    migrations: {
      path: join(packageDirectory, 'prisma', 'migrations'),
      seed: 'tsx prisma/seed.ts',
    },
    datasource: {
      url: environment.migrationDatabaseUrl,
    },
  });
};
