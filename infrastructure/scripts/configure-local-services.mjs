import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseDotenv } from 'dotenv';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const environmentFile = join(workspaceRoot, '.env');

if (!process.argv.includes('--yes')) {
  console.error('This rewrites only the PostgreSQL and Redis entries in the root .env for local Docker.');
  console.error('Existing database and Redis credentials are preserved; service hostnames are changed.');
  console.error('To confirm, run: pnpm env:configure-local -- --yes');
  process.exit(1);
}
if (!existsSync(environmentFile)) {
  console.error('Root .env was not found. Copy .env.example to .env first.');
  process.exit(1);
}

const original = readFileSync(environmentFile, 'utf8');
const parsed = parseDotenv(original);
if (parsed.DATABASE_URL === undefined || parsed.REDIS_URL === undefined) {
  console.error('DATABASE_URL and REDIS_URL must already be defined.');
  process.exit(1);
}

const databaseUrl = new URL(parsed.DATABASE_URL);
const redisUrl = new URL(parsed.REDIS_URL);
if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
  console.error('DATABASE_URL must be a PostgreSQL URL.');
  process.exit(1);
}
if (!['redis:', 'rediss:'].includes(redisUrl.protocol)) {
  console.error('REDIS_URL must be a Redis URL.');
  process.exit(1);
}

const postgresUser = decodeURIComponent(databaseUrl.username);
const postgresPassword = decodeURIComponent(databaseUrl.password);
const postgresDatabase = databaseUrl.pathname.replace(/^\/+/, '');
const redisPassword = decodeURIComponent(redisUrl.password);
if (
  postgresUser.length === 0 ||
  postgresPassword.length === 0 ||
  postgresDatabase.length === 0 ||
  redisPassword.length === 0
) {
  console.error('Existing database and Redis URLs must contain credentials and a database name.');
  process.exit(1);
}

const postgresPort = parsed.POSTGRES_PORT ?? '5432';
const redisPort = parsed.REDIS_PORT ?? '6379';

const hostDatabaseUrl = new URL(databaseUrl);
hostDatabaseUrl.hostname = '127.0.0.1';
hostDatabaseUrl.port = postgresPort;
const dockerDatabaseUrl = new URL(databaseUrl);
dockerDatabaseUrl.hostname = 'postgres';
dockerDatabaseUrl.port = '5432';

const hostRedisUrl = new URL(redisUrl);
hostRedisUrl.hostname = '127.0.0.1';
hostRedisUrl.port = redisPort;
const dockerRedisUrl = new URL(redisUrl);
dockerRedisUrl.hostname = 'redis';
dockerRedisUrl.port = '6379';

const replacements = new Map([
  ['POSTGRES_USER', postgresUser],
  ['POSTGRES_PASSWORD', postgresPassword],
  ['POSTGRES_DB', postgresDatabase],
  ['POSTGRES_PORT', postgresPort],
  ['REDIS_PASSWORD', redisPassword],
  ['REDIS_PORT', redisPort],
  ['DATABASE_URL', hostDatabaseUrl.toString()],
  ['DIRECT_DATABASE_URL', hostDatabaseUrl.toString()],
  ['DATABASE_URL_DOCKER', dockerDatabaseUrl.toString()],
  ['DIRECT_DATABASE_URL_DOCKER', dockerDatabaseUrl.toString()],
  ['REDIS_URL', hostRedisUrl.toString()],
  ['REDIS_URL_DOCKER', dockerRedisUrl.toString()],
]);

const seen = new Set();
const updatedLines = original.split(/\r?\n/).map((line) => {
  const match = /^([A-Z][A-Z0-9_]*)=/.exec(line);
  if (match === null || !replacements.has(match[1])) return line;
  const key = match[1];
  seen.add(key);
  return `${key}=${replacements.get(key)}`;
});
for (const [key, value] of replacements) {
  if (!seen.has(key)) updatedLines.push(`${key}=${value}`);
}

writeFileSync(environmentFile, `${updatedLines.join('\n').replace(/\n+$/, '')}\n`, {
  encoding: 'utf8',
  mode: 0o600,
});
console.info('Root .env now targets local host services and Docker service DNS names.');
console.info('Existing credential values were preserved and were not printed.');
