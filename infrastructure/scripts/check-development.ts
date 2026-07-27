import { Redis } from 'ioredis';
import pg from 'pg';
import { loadAppConfig, loadRootEnvironment } from '../../packages/config/src/index.js';
import { loadDatabaseEnvironment } from '../../packages/database/environment.js';

type Result = { label: string; ready: boolean; detail: string };
const results: Result[] = [];
const record = (label: string, ready: boolean, detail: string): void => {
  results.push({ label, ready, detail });
};

const request = async (label: string, url: string): Promise<void> => {
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
    const ready = response.status >= 200 && response.status < 400;
    record(label, ready, `HTTP ${String(response.status)}`);
  } catch (error) {
    record(label, false, error instanceof Error ? error.message : 'request failed');
  }
};

const rootEnvironment = loadRootEnvironment({ required: true });
const config = loadAppConfig({ rootDirectory: rootEnvironment.rootDirectory, reload: true });
const databaseEnvironment = loadDatabaseEnvironment({
  rootDirectory: rootEnvironment.rootDirectory,
  requireEnvironmentFile: true,
});

await Promise.all([
  request('Web', 'http://127.0.0.1:3000/'),
  request('API health', 'http://127.0.0.1:3001/v1/health'),
  request('API readiness', 'http://127.0.0.1:3001/v1/ready'),
]);

const pool = new pg.Pool({
  connectionString: databaseEnvironment.databaseUrl,
  max: 1,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 5_000,
});
try {
  await pool.query('SELECT 1');
  record('PostgreSQL', true, 'query succeeded');
} catch (error) {
  record('PostgreSQL', false, error instanceof Error ? error.message : 'query failed');
} finally {
  await pool.end();
}

const redis = new Redis(process.env.REDIS_URL ?? '', {
  lazyConnect: true,
  connectTimeout: 5_000,
  commandTimeout: 3_000,
  maxRetriesPerRequest: 0,
  retryStrategy: () => null,
});

try {
  await redis.connect();
  const pong = await redis.ping();
  record('Redis', pong === 'PONG', pong);

  for (const service of ['bot', 'worker'] as const) {
    const registryKey = `${config.cache.namespace}:runtime:${service}:instances`;
    const instanceIds = await redis.zrangebyscore(registryKey, Date.now() - 30_000, '+inf');
    const heartbeatKeys = instanceIds.map(
      (instanceId) => `${config.cache.namespace}:runtime:${service}:heartbeat:${instanceId}`,
    );
    const heartbeats = heartbeatKeys.length === 0 ? [] : await redis.mget(...heartbeatKeys);
    const liveCount = heartbeats.filter((heartbeat) => {
      if (heartbeat === null) return false;
      try {
        const parsed = JSON.parse(heartbeat) as { updatedAt?: unknown };
        return (
          typeof parsed.updatedAt === 'string' &&
          Date.now() - new Date(parsed.updatedAt).getTime() <= 30_000
        );
      } catch {
        return false;
      }
    }).length;
    record(
      service === 'bot' ? 'Bot' : 'Worker',
      liveCount > 0,
      liveCount > 0 ? `${String(liveCount)} live instance(s)` : 'no live heartbeat',
    );
  }
} catch (error) {
  const detail = error instanceof Error ? error.message : 'Redis check failed';
  if (!results.some((result) => result.label === 'Redis')) record('Redis', false, detail);
  record('Bot', false, 'heartbeat unavailable because Redis could not be checked');
  record('Worker', false, 'heartbeat unavailable because Redis could not be checked');
} finally {
  if (redis.status !== 'end') redis.disconnect();
}

for (const result of results) {
  console.info(`${result.label}: ${result.ready ? 'ready' : 'not ready'} (${result.detail})`);
}
if (results.some((result) => !result.ready)) process.exitCode = 1;
