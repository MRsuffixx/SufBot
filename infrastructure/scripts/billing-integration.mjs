import { spawn } from 'node:child_process';

const databaseName = 'sufbot_billing_test';
const loopbackHosts = new Set(['127.0.0.1', '::1', 'localhost']);

const sourceDatabaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL;
if (sourceDatabaseUrl === undefined || redisUrl === undefined) {
  throw new Error('DATABASE_URL and REDIS_URL are required for local billing integration tests.');
}

const source = new URL(sourceDatabaseUrl);
const redis = new URL(redisUrl);
if (
  !loopbackHosts.has(source.hostname.toLowerCase()) ||
  !loopbackHosts.has(redis.hostname.toLowerCase())
) {
  throw new Error('Billing integration tests require loopback PostgreSQL and Redis services.');
}

const testDatabase = new URL(source.toString());
testDatabase.pathname = `/${databaseName}`;
testDatabase.searchParams.set('schema', 'public');
const testEnvironment = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: testDatabase.toString(),
  DIRECT_DATABASE_URL: testDatabase.toString(),
  TEST_DATABASE_URL: testDatabase.toString(),
  TEST_REDIS_URL: redis.toString(),
};

const run = (executable, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: process.cwd(),
      env: options.env ?? process.env,
      stdio: options.stdio ?? 'inherit',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal !== null) {
        reject(new Error(`${executable} terminated by ${signal}`));
      } else if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${executable} exited with code ${String(code)}`));
      }
    });
  });

const capture = (executable, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal !== null || code !== 0) {
        reject(new Error(stderr.trim() || `${executable} failed`));
      } else {
        resolve(stdout);
      }
    });
  });

const pnpmScript = process.env.npm_execpath;
const pnpmIsNodeScript = pnpmScript !== undefined && /\.(?:cjs|mjs|js)$/i.test(pnpmScript);
const useWindowsCommandShim = !pnpmIsNodeScript && process.platform === 'win32';
const pnpmExecutable = pnpmIsNodeScript
  ? process.execPath
  : useWindowsCommandShim
    ? (process.env.ComSpec ?? 'cmd.exe')
    : 'pnpm';
const pnpmArgs = (args) =>
  pnpmIsNodeScript
    ? [pnpmScript, ...args]
    : useWindowsCommandShim
      ? ['/d', '/s', '/c', 'pnpm', ...args]
      : args;

const dockerExecutable = process.platform === 'win32' ? 'docker.exe' : 'docker';
const postgresUser = decodeURIComponent(source.username);
const sourceDatabaseName = source.pathname.replace(/^\/+/, '');
const databaseExists = await capture(dockerExecutable, [
  'compose',
  'exec',
  '-T',
  'postgres',
  'psql',
  '-U',
  postgresUser,
  '-d',
  sourceDatabaseName,
  '-tAc',
  `SELECT 1 FROM pg_database WHERE datname='${databaseName}'`,
]);
if (databaseExists.trim() !== '1') {
  await run(dockerExecutable, [
    'compose',
    'exec',
    '-T',
    'postgres',
    'createdb',
    '-U',
    postgresUser,
    databaseName,
  ]);
}
await run(
  pnpmExecutable,
  pnpmArgs([
    '--filter',
    '@sufbot/database',
    'exec',
    'prisma',
    'migrate',
    'deploy',
    '--config',
    'prisma.integration.config.ts',
  ]),
  { env: testEnvironment },
);
await run(pnpmExecutable, pnpmArgs(['run', 'build:packages:workspace']), {
  env: testEnvironment,
});
await run(
  pnpmExecutable,
  pnpmArgs([
    'exec',
    'vitest',
    'run',
    'tests/integration',
    'packages/database/database.integration.test.ts',
    '--no-file-parallelism',
  ]),
  { env: testEnvironment },
);
