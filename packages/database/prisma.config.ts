import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';
import { loadDatabaseEnvironment } from './environment.js';

const packageDirectory = dirname(fileURLToPath(import.meta.url));
const environment = loadDatabaseEnvironment();

export default defineConfig({
  schema: join(packageDirectory, 'prisma', 'schema.prisma'),
  migrations: {
    path: join(packageDirectory, 'prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: environment.migrationDatabaseUrl,
  },
});
