import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrismaConfig } from './prisma-config.js';

const packageDirectory = dirname(fileURLToPath(import.meta.url));

export default createPrismaConfig({
  environment: process.env,
  rootDirectory: join(packageDirectory, '.integration-environment-without-dotenv'),
});
