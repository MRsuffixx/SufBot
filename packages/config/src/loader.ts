import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError, ValidationError } from '@sufbot/shared';
import {
  ApiEnvironmentSchema,
  AppConfigSchema,
  BotEnvironmentSchema,
  WebEnvironmentSchema,
  WorkerEnvironmentSchema,
  type ApiEnvironment,
  type AppConfig,
  type BotEnvironment,
  type WebEnvironment,
  type WorkerEnvironment,
} from './schema.js';

const packageDirectory = dirname(fileURLToPath(import.meta.url));

const findWorkspaceRoot = (start = process.cwd()): string => {
  let current = resolve(start);
  for (let depth = 0; depth < 8; depth += 1) {
    if (
      existsSync(join(current, 'config.json')) &&
      existsSync(join(current, 'pnpm-workspace.yaml'))
    ) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  const fromPackage = resolve(packageDirectory, '../../../');
  if (existsSync(join(fromPackage, 'config.json'))) return fromPackage;
  throw new AppError({
    code: 'CONFIG_NOT_FOUND',
    message: 'Unable to locate config.json from the current working directory.',
    statusCode: 500,
    expose: true,
  });
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const deepMerge = (
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> => {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = merged[key];
    merged[key] = isObject(current) && isObject(value) ? deepMerge(current, value) : value;
  }
  return merged;
};

const readJson = (path: string): unknown => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch (error) {
    throw new ValidationError(`Configuration file could not be parsed: ${path}`, {
      reason: error instanceof Error ? error.message : 'unknown',
    });
  }
};

let cachedConfig: AppConfig | undefined;

export const loadAppConfig = (options?: {
  rootDirectory?: string;
  environment?: 'development' | 'test' | 'production';
  reload?: boolean;
}): AppConfig => {
  if (cachedConfig !== undefined && options?.reload !== true) return cachedConfig;
  const root = options?.rootDirectory ?? findWorkspaceRoot();
  const environment =
    options?.environment ??
    (process.env.NODE_ENV === 'production'
      ? 'production'
      : process.env.NODE_ENV === 'test'
        ? 'test'
        : 'development');
  const base = readJson(join(root, 'config.json'));
  if (!isObject(base)) throw new ValidationError('config.json must contain a JSON object.');

  const overridePath = join(root, `config.${environment}.json`);
  const merged = existsSync(overridePath)
    ? deepMerge(
        base,
        (() => {
          const override = readJson(overridePath);
          if (!isObject(override)) {
            throw new ValidationError(`${overridePath} must contain a JSON object.`);
          }
          return override;
        })(),
      )
    : base;

  const parsed = AppConfigSchema.safeParse(merged);
  if (!parsed.success) {
    throw new ValidationError('Application configuration is invalid.', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  cachedConfig = Object.freeze(parsed.data);
  return cachedConfig;
};

const parseEnvironment = <T>(schema: {
  safeParse: (input: unknown) =>
    | { success: true; data: T }
    | {
        success: false;
        error: { issues: ReadonlyArray<{ path: PropertyKey[]; message: string }> };
      };
}): T => {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const summary = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');
    throw new ValidationError(`Environment validation failed: ${summary}`);
  }
  return parsed.data;
};

export const loadApiEnvironment = (): ApiEnvironment => parseEnvironment(ApiEnvironmentSchema);
export const loadBotEnvironment = (): BotEnvironment => parseEnvironment(BotEnvironmentSchema);
export const loadWorkerEnvironment = (): WorkerEnvironment =>
  parseEnvironment(WorkerEnvironmentSchema);
export const loadWebEnvironment = (): WebEnvironment => parseEnvironment(WebEnvironmentSchema);

export const clearConfigCacheForTests = (): void => {
  cachedConfig = undefined;
};
