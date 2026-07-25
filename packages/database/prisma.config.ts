import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const cliDatabaseUrl =
  process.env.DIRECT_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://invalid:invalid@127.0.0.1:5432/sufbot';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: cliDatabaseUrl,
  },
});
