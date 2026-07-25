import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { AppError, ValidationError } from '@sufbot/shared';

const packageDirectory = dirname(fileURLToPath(import.meta.url));

const hasWorkspaceMarkers = (directory: string): boolean =>
  existsSync(join(directory, 'config.json')) &&
  (existsSync(join(directory, 'pnpm-workspace.yaml')) || process.env.SUFBOT_ROOT === directory);

const searchParents = (start: string): string | undefined => {
  let current = resolve(start);
  for (let depth = 0; depth < 12; depth += 1) {
    if (hasWorkspaceMarkers(current)) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return undefined;
};

export const findWorkspaceRoot = (startDirectory = process.cwd()): string => {
  const explicitRoot = process.env.SUFBOT_ROOT;
  if (explicitRoot !== undefined) {
    const resolvedRoot = resolve(explicitRoot);
    if (!hasWorkspaceMarkers(resolvedRoot)) {
      throw new AppError({
        code: 'CONFIG_NOT_FOUND',
        message: 'SUFBOT_ROOT does not contain the required application configuration.',
        statusCode: 500,
        expose: true,
      });
    }
    return resolvedRoot;
  }

  const fromStart = searchParents(startDirectory);
  if (fromStart !== undefined) return fromStart;

  const fromPackage = searchParents(packageDirectory);
  if (fromPackage !== undefined) return fromPackage;

  throw new AppError({
    code: 'CONFIG_NOT_FOUND',
    message: 'Unable to locate the SufBot workspace root.',
    statusCode: 500,
    expose: true,
  });
};

export type RootEnvironmentResult = {
  rootDirectory: string;
  environmentFilePath: string;
  found: boolean;
  loadedKeys: string[];
};

export type SafeConnectionMetadata = {
  protocol: string;
  host: string;
  port: string;
  database: string;
  username: string;
  password: '[REDACTED]';
};

export const getSafeConnectionMetadata = (value: string): SafeConnectionMetadata => {
  const parsed = new URL(value);
  return {
    protocol: parsed.protocol.replace(/:$/, ''),
    host: parsed.hostname,
    port: parsed.port,
    database: parsed.pathname.replace(/^\/+/, ''),
    username: decodeURIComponent(parsed.username),
    password: '[REDACTED]',
  };
};

export const loadRootEnvironment = (options?: {
  rootDirectory?: string;
  environment?: NodeJS.ProcessEnv;
  override?: boolean;
  required?: boolean;
}): RootEnvironmentResult => {
  const rootDirectory = options?.rootDirectory ?? findWorkspaceRoot();
  const environmentFilePath = join(rootDirectory, '.env');
  const found = existsSync(environmentFilePath);

  if (!found) {
    if (options?.required === true) {
      throw new ValidationError(
        'Root .env file was not found. Copy .env.example to .env before local development.',
      );
    }
    return { rootDirectory, environmentFilePath, found, loadedKeys: [] };
  }

  const targetEnvironment = options?.environment ?? process.env;
  const existingNodeEnvironment = targetEnvironment.NODE_ENV;
  const result = loadDotenv({
    path: environmentFilePath,
    processEnv: targetEnvironment,
    override: options?.override ?? true,
    quiet: true,
  });
  if (result.error !== undefined) {
    throw new ValidationError('Root .env file could not be loaded.', {
      reason: result.error.message,
    });
  }
  if (existingNodeEnvironment !== undefined) {
    Reflect.set(targetEnvironment, 'NODE_ENV', existingNodeEnvironment);
  }

  return {
    rootDirectory,
    environmentFilePath,
    found,
    loadedKeys: Object.keys(result.parsed ?? {}),
  };
};
