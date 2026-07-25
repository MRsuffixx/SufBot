import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

const databasePackageDirectory = dirname(fileURLToPath(import.meta.url));
const supportedProtocols = new Set(['postgres:', 'postgresql:']);

const findRootFrom = (start: string): string | undefined => {
  let current = resolve(start);
  for (let depth = 0; depth < 12; depth += 1) {
    if (
      existsSync(join(current, 'package.json')) &&
      existsSync(join(current, 'pnpm-workspace.yaml'))
    ) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return undefined;
};

export const resolveDatabaseWorkspaceRoot = (
  startDirectory = process.cwd(),
  environment: NodeJS.ProcessEnv = process.env,
): string => {
  const explicitRoot = environment.SUFBOT_ROOT;
  if (explicitRoot !== undefined) return resolve(explicitRoot);
  return (
    findRootFrom(startDirectory) ??
    findRootFrom(databasePackageDirectory) ??
    resolve(databasePackageDirectory, '../..')
  );
};

export const validateDatabaseUrl = (value: string, variableName: string): string => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError(`${variableName} must be a valid PostgreSQL connection URL.`);
  }
  if (
    !supportedProtocols.has(parsed.protocol) ||
    parsed.hostname.length === 0 ||
    parsed.username.length === 0 ||
    parsed.pathname.replace(/^\/+/, '').length === 0
  ) {
    throw new TypeError(`${variableName} must be a valid PostgreSQL connection URL.`);
  }
  return value;
};

export type DatabaseEnvironment = {
  databaseUrl: string;
  directDatabaseUrl?: string;
  migrationDatabaseUrl: string;
  environmentFilePath: string;
  environmentFileFound: boolean;
};

export const loadDatabaseEnvironment = (options?: {
  environment?: NodeJS.ProcessEnv;
  rootDirectory?: string;
  requireEnvironmentFile?: boolean;
}): DatabaseEnvironment => {
  const environment = options?.environment ?? process.env;
  const rootDirectory =
    options?.rootDirectory ?? resolveDatabaseWorkspaceRoot(process.cwd(), environment);
  const environmentFilePath = join(rootDirectory, '.env');
  const environmentFileFound = existsSync(environmentFilePath);

  if (environmentFileFound) {
    const result = loadDotenv({
      path: environmentFilePath,
      processEnv: environment,
      override: true,
      quiet: true,
    });
    if (result.error !== undefined) {
      throw new TypeError('The root .env file could not be loaded.');
    }
  } else if (options?.requireEnvironmentFile === true) {
    throw new TypeError(
      'Root .env file was not found. Copy .env.example to .env before local database commands.',
    );
  }

  const databaseUrl = environment.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
    throw new TypeError(
      'DATABASE_URL is required. Define it in the root .env file or the process environment.',
    );
  }
  validateDatabaseUrl(databaseUrl, 'DATABASE_URL');

  const directDatabaseUrl = environment.DIRECT_DATABASE_URL;
  if (directDatabaseUrl !== undefined && directDatabaseUrl.trim().length > 0) {
    validateDatabaseUrl(directDatabaseUrl, 'DIRECT_DATABASE_URL');
  }

  return {
    databaseUrl,
    ...(directDatabaseUrl === undefined || directDatabaseUrl.trim().length === 0
      ? {}
      : { directDatabaseUrl }),
    migrationDatabaseUrl: directDatabaseUrl ?? databaseUrl,
    environmentFilePath,
    environmentFileFound,
  };
};
