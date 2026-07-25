import { Redis } from 'ioredis';
import pg from 'pg';
import { loadAppConfig, loadRootEnvironment } from '../../packages/config/src/index.js';
import { loadDatabaseEnvironment } from '../../packages/database/environment.js';
import { createPrismaClient } from '../../packages/database/src/client.js';

const requiredTables = [
  'BackgroundJobRecord',
  'FeatureFlag',
  'Guild',
  'GuildAuditLog',
  'GuildModule',
  'GuildSettings',
  'LocaleDefinition',
  'ModuleDefinition',
  'PlatformConfiguration',
  'User',
] as const;

const rootEnvironment = loadRootEnvironment({ required: true });
loadAppConfig({ rootDirectory: rootEnvironment.rootDirectory, reload: true });
const databaseEnvironment = loadDatabaseEnvironment({
  rootDirectory: rootEnvironment.rootDirectory,
  requireEnvironmentFile: true,
});

const pool = new pg.Pool({
  connectionString: databaseEnvironment.databaseUrl,
  max: 1,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 5_000,
});
const redis = new Redis(process.env.REDIS_URL ?? '', {
  lazyConnect: true,
  connectTimeout: 5_000,
  commandTimeout: 3_000,
  maxRetriesPerRequest: 0,
  retryStrategy: () => null,
});

let failed = false;
try {
  const databaseIdentity = await pool.query<{
    database_name: string;
    database_user: string;
  }>('SELECT current_database() AS database_name, current_user AS database_user');
  console.info(
    `PostgreSQL: connected (${databaseIdentity.rows[0]?.database_name ?? 'unknown'} as ${databaseIdentity.rows[0]?.database_user ?? 'unknown'})`,
  );

  const migrationTable = await pool.query<{ relation: string | null }>(
    `SELECT to_regclass('public."_prisma_migrations"')::text AS relation`,
  );
  if (migrationTable.rows[0]?.relation === null) {
    console.info('Prisma migrations: database is not initialized');
  } else {
    const migrations = await pool.query<{ migration_name: string }>(
      `SELECT "migration_name"
         FROM "_prisma_migrations"
        WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL
        ORDER BY "finished_at"`,
    );
    console.info(
      `Prisma migrations: ${migrations.rows.length === 0 ? 'none applied' : migrations.rows.map((row) => row.migration_name).join(', ')}`,
    );
  }

  const tables = await pool.query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'`,
  );
  const availableTables = new Set(tables.rows.map((row) => row.table_name));
  const missingTables = requiredTables.filter((table) => !availableTables.has(table));
  if (missingTables.length > 0) {
    failed = true;
    console.error(`Required database tables: missing (${missingTables.join(', ')})`);
  } else {
    console.info(`Required database tables: present (${requiredTables.length})`);
  }

  const prisma = createPrismaClient(databaseEnvironment.databaseUrl);
  try {
    await prisma.featureFlag.count();
    console.info('Prisma Client: connected');
  } finally {
    await prisma.$disconnect();
  }

  console.info('Configuration loading: valid');
} catch (error) {
  failed = true;
  console.error(
    `PostgreSQL check failed: ${error instanceof Error ? error.message : 'unknown error'}`,
  );
}

try {
  await redis.connect();
  const pong = await redis.ping();
  if (pong !== 'PONG') {
    failed = true;
    console.error('Redis: ping failed');
  } else {
    console.info('Redis: connected (PONG)');
  }
} catch (error) {
  failed = true;
  console.error(`Redis check failed: ${error instanceof Error ? error.message : 'unknown error'}`);
} finally {
  await pool.end();
  if (redis.status !== 'end') redis.disconnect();
}

if (failed) process.exitCode = 1;
