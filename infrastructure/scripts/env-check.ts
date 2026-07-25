import { timingSafeEqual } from 'node:crypto';
import {
  ApiEnvironmentSchema,
  AppConfigSchema,
  BotEnvironmentSchema,
  WebEnvironmentSchema,
  WorkerEnvironmentSchema,
  getSafeConnectionMetadata,
  loadAppConfig,
  loadRootEnvironment,
} from '../../packages/config/src/index.js';
import { loadDatabaseEnvironment } from '../../packages/database/environment.js';

type Check = { label: string; valid: boolean; detail?: string };

const checks: Check[] = [];
const check = (label: string, valid: boolean, detail?: string): void => {
  checks.push({ label, valid, ...(detail === undefined ? {} : { detail }) });
};

const rootEnvironment = loadRootEnvironment({ required: true });
check('Environment file', rootEnvironment.found, rootEnvironment.found ? 'found' : 'missing');

let databaseUrl: URL | undefined;
try {
  const databaseEnvironment = loadDatabaseEnvironment({
    rootDirectory: rootEnvironment.rootDirectory,
    requireEnvironmentFile: true,
  });
  databaseUrl = new URL(databaseEnvironment.databaseUrl);
  check('DATABASE_URL', true, 'valid');
  check(
    'DIRECT_DATABASE_URL',
    databaseEnvironment.directDatabaseUrl === undefined ||
      databaseEnvironment.directDatabaseUrl.length === 0 ||
      new URL(databaseEnvironment.directDatabaseUrl).protocol.startsWith('postgres'),
    databaseEnvironment.directDatabaseUrl === undefined ? 'not set (optional)' : 'valid',
  );
} catch (error) {
  check('DATABASE_URL', false, error instanceof Error ? error.message : 'invalid');
}

const parseUrl = (
  name: string,
  protocols: ReadonlySet<string>,
  required = true,
): URL | undefined => {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    check(name, !required, required ? 'missing' : 'not set (optional)');
    return undefined;
  }
  try {
    const parsed = new URL(value);
    const valid =
      protocols.has(parsed.protocol) && parsed.hostname.length > 0 && parsed.port.length > 0;
    check(name, valid, valid ? 'valid' : 'invalid URL');
    return valid ? parsed : undefined;
  } catch {
    check(name, false, 'invalid URL');
    return undefined;
  }
};

const redisUrl = parseUrl('REDIS_URL', new Set(['redis:', 'rediss:']));
const dockerDatabaseUrl = parseUrl('DATABASE_URL_DOCKER', new Set(['postgres:', 'postgresql:']));
const dockerRedisUrl = parseUrl('REDIS_URL_DOCKER', new Set(['redis:', 'rediss:']));

const requiredValues = [
  'DISCORD_BOT_TOKEN',
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'AUTH_SECRET',
  'INTERNAL_API_SECRET',
  'WEBHOOK_SIGNING_SECRET',
  'ENCRYPTION_KEY',
  'SESSION_ENCRYPTION_KEY',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'POSTGRES_DB',
  'REDIS_PASSWORD',
] as const;
for (const name of requiredValues) {
  check(
    name,
    (process.env[name]?.length ?? 0) > 0,
    (process.env[name]?.length ?? 0) > 0 ? 'defined' : 'missing',
  );
}

const environmentSchemas = [
  ['API environment', ApiEnvironmentSchema],
  ['Web environment', WebEnvironmentSchema],
  ['Bot environment', BotEnvironmentSchema],
  ['Worker environment', WorkerEnvironmentSchema],
] as const;
for (const [label, schema] of environmentSchemas) {
  const parsed = schema.safeParse(process.env);
  check(
    label,
    parsed.success,
    parsed.success
      ? 'valid'
      : parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
  );
}

try {
  const config = loadAppConfig({ rootDirectory: rootEnvironment.rootDirectory, reload: true });
  check('config.json', AppConfigSchema.safeParse(config).success, 'valid');
} catch (error) {
  check('config.json', false, error instanceof Error ? error.message : 'invalid');
}

if (databaseUrl !== undefined) {
  const metadata = getSafeConnectionMetadata(databaseUrl.toString());
  console.info(`Database host: ${metadata.host}`);
  console.info(`Database port: ${metadata.port || '5432'}`);
  console.info(`Database name: ${metadata.database}`);
  console.info(`Database username: ${metadata.username}`);
  console.info(`Database password: ${metadata.password}`);
}
if (redisUrl !== undefined) {
  const metadata = getSafeConnectionMetadata(redisUrl.toString());
  console.info(`Redis host: ${metadata.host}`);
  console.info(`Redis port: ${metadata.port || '6379'}`);
  console.info(`Redis database: ${metadata.database || '0'}`);
  console.info(`Redis password: ${metadata.password}`);
}

const sameSecret = (first: string | undefined, second: string | undefined): boolean => {
  if (first === undefined || second === undefined) return false;
  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);
  return firstBuffer.length === secondBuffer.length && timingSafeEqual(firstBuffer, secondBuffer);
};

if (databaseUrl !== undefined && dockerDatabaseUrl !== undefined) {
  check(
    'Host database hostname',
    ['127.0.0.1', 'localhost'].includes(databaseUrl.hostname),
    databaseUrl.hostname,
  );
  check(
    'Docker database hostname',
    dockerDatabaseUrl.hostname === 'postgres',
    dockerDatabaseUrl.hostname,
  );
  check(
    'PostgreSQL username consistency',
    decodeURIComponent(databaseUrl.username) === process.env.POSTGRES_USER &&
      decodeURIComponent(dockerDatabaseUrl.username) === process.env.POSTGRES_USER,
  );
  check(
    'PostgreSQL password consistency',
    sameSecret(decodeURIComponent(databaseUrl.password), process.env.POSTGRES_PASSWORD) &&
      sameSecret(decodeURIComponent(dockerDatabaseUrl.password), process.env.POSTGRES_PASSWORD),
  );
  check(
    'PostgreSQL database consistency',
    databaseUrl.pathname.replace(/^\/+/, '') === process.env.POSTGRES_DB &&
      dockerDatabaseUrl.pathname.replace(/^\/+/, '') === process.env.POSTGRES_DB,
  );
}
if (redisUrl !== undefined && dockerRedisUrl !== undefined) {
  check('Docker Redis hostname', dockerRedisUrl.hostname === 'redis', dockerRedisUrl.hostname);
  check(
    'Redis password consistency',
    sameSecret(decodeURIComponent(redisUrl.password), process.env.REDIS_PASSWORD) &&
      sameSecret(decodeURIComponent(dockerRedisUrl.password), process.env.REDIS_PASSWORD),
  );
}

for (const result of checks) {
  console.info(
    `${result.label}: ${result.valid ? (result.detail ?? 'valid') : `INVALID (${result.detail ?? 'failed'})`}`,
  );
}

if (checks.some((result) => !result.valid)) {
  process.exitCode = 1;
}
