// src/loader.ts
import { existsSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { AppError, ValidationError } from "@sufbot/shared";

// src/schema.ts
import { z } from "zod";
import { DiscordSnowflakeSchema, LocaleSchema } from "@sufbot/shared";
var UrlSchema = z.url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol));
var AppConfigSchema = z.object({
  $schemaVersion: z.literal(1),
  application: z.object({
    name: z.string().min(1).max(64),
    description: z.string().min(1).max(300),
    ownerName: z.string().min(1).max(64),
    ownerDiscordUsername: z.string().min(1).max(64),
    ownerGitHubUrl: UrlSchema,
    websiteUrl: UrlSchema,
    apiUrl: UrlSchema,
    defaultLocale: LocaleSchema,
    supportedLocales: z.array(LocaleSchema).min(1)
  }),
  discord: z.object({
    defaultPrefix: z.string().min(1).max(5),
    enablePrefixCommands: z.boolean(),
    enableSlashCommands: z.boolean(),
    registerCommandsGlobally: z.boolean(),
    developmentGuildIds: z.array(DiscordSnowflakeSchema),
    requiredInvitePermissions: z.array(z.string().min(1)),
    intents: z.array(z.string().min(1)),
    partials: z.array(z.string().min(1)),
    sharding: z.object({
      enabled: z.boolean(),
      mode: z.enum(["auto", "manual"]),
      totalShards: z.union([z.literal("auto"), z.number().int().positive()])
    })
  }),
  dashboard: z.object({
    theme: z.enum(["light", "dark", "system"]),
    allowGuildOwnerAccess: z.boolean(),
    allowManageGuildPermission: z.boolean(),
    allowedAdministrativePermissions: z.array(z.string().min(1)),
    itemsPerPage: z.number().int().min(5).max(100)
  }),
  server: z.object({
    webPort: z.number().int().min(1).max(65535),
    apiPort: z.number().int().min(1).max(65535),
    apiHost: z.string().min(1),
    corsAllowedOrigins: z.array(UrlSchema).min(1),
    bodyLimitBytes: z.number().int().min(1024).max(10 * 1024 * 1024),
    requestTimeoutMs: z.number().int().min(1e3).max(12e4),
    openApiEnabled: z.boolean()
  }),
  security: z.object({
    rateLimits: z.object({
      enabled: z.boolean(),
      windowSeconds: z.number().int().min(1).max(3600),
      maxRequests: z.number().int().min(1).max(1e5)
    }),
    session: z.object({
      maxAgeSeconds: z.number().int().min(300).max(2592e3),
      guildPermissionFreshnessSeconds: z.number().int().min(30).max(3600)
    }),
    auditLogRetentionDays: z.number().int().min(30).max(3650),
    internalRequestMaxAgeSeconds: z.number().int().min(5).max(300),
    maxPaginationSize: z.number().int().min(1).max(500)
  }),
  cache: z.object({
    namespace: z.string().regex(/^[a-z][a-z0-9_-]{1,30}$/),
    guildConfigTtlSeconds: z.number().int().min(10).max(86400),
    localTtlSeconds: z.number().int().min(1).max(3600),
    invalidationChannel: z.string().min(1).max(100)
  }),
  queue: z.object({
    prefix: z.string().regex(/^[a-z][a-z0-9_-]{1,30}$/),
    defaultAttempts: z.number().int().min(1).max(20),
    backoffDelayMs: z.number().int().min(100).max(3e5),
    removeCompletedAfterSeconds: z.number().int().min(60),
    removeFailedAfterSeconds: z.number().int().min(60)
  }),
  features: z.object({
    premium: z.boolean(),
    analytics: z.boolean(),
    publicApi: z.boolean(),
    backgroundJobs: z.boolean()
  }),
  logging: z.object({
    level: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]),
    prettyDevelopmentLogs: z.boolean()
  })
}).strict();
var RuntimeEnvironmentSchema = z.enum(["development", "test", "production"]).default("development");
var SecretSchema = z.string().min(32);
var DatabaseUrlSchema = z.string().refine((value) => value.startsWith("postgresql://"), {
  message: "must be a PostgreSQL connection URL"
});
var RedisUrlSchema = z.string().refine((value) => value.startsWith("redis://") || value.startsWith("rediss://"), {
  message: "must be a Redis connection URL"
});
var EncryptionKeySchema = z.string().refine(
  (value) => {
    try {
      return Buffer.from(value, "base64").length === 32;
    } catch {
      return false;
    }
  },
  { message: "must be a base64-encoded 32-byte key" }
);
var SnowflakeListSchema = z.string().default("").transform((value, context) => {
  const ids = value.split(",").map((id) => id.trim()).filter(Boolean);
  for (const id of ids) {
    if (!DiscordSnowflakeSchema.safeParse(id).success) {
      context.addIssue({ code: "custom", message: `Invalid Discord snowflake: ${id}` });
      return z.NEVER;
    }
  }
  return [...new Set(ids)];
});
var CommonEnvironmentShape = {
  NODE_ENV: RuntimeEnvironmentSchema,
  DATABASE_URL: DatabaseUrlSchema,
  REDIS_URL: RedisUrlSchema,
  SENTRY_DSN: z.string().optional()
};
var ApiEnvironmentSchema = z.object({
  ...CommonEnvironmentShape,
  INTERNAL_API_SECRET: SecretSchema,
  WEBHOOK_SIGNING_SECRET: SecretSchema
});
var BotEnvironmentSchema = z.object({
  ...CommonEnvironmentShape,
  DISCORD_BOT_TOKEN: SecretSchema,
  DISCORD_CLIENT_ID: DiscordSnowflakeSchema,
  BOT_OWNER_DISCORD_IDS: SnowflakeListSchema,
  BOT_DEVELOPER_DISCORD_IDS: SnowflakeListSchema,
  PLATFORM_ADMIN_DISCORD_IDS: SnowflakeListSchema
});
var WorkerEnvironmentSchema = z.object({
  ...CommonEnvironmentShape
});
var WebEnvironmentSchema = z.object({
  ...CommonEnvironmentShape,
  DISCORD_CLIENT_ID: DiscordSnowflakeSchema,
  DISCORD_CLIENT_SECRET: SecretSchema,
  AUTH_SECRET: SecretSchema,
  AUTH_TRUST_HOST: z.stringbool().default(true),
  INTERNAL_API_SECRET: SecretSchema,
  ENCRYPTION_KEY: EncryptionKeySchema,
  SESSION_ENCRYPTION_KEY: EncryptionKeySchema,
  BOT_OWNER_DISCORD_IDS: SnowflakeListSchema,
  BOT_DEVELOPER_DISCORD_IDS: SnowflakeListSchema,
  PLATFORM_ADMIN_DISCORD_IDS: SnowflakeListSchema
});

// src/loader.ts
var packageDirectory = dirname(fileURLToPath(import.meta.url));
var findWorkspaceRoot = (start = process.cwd()) => {
  let current = resolve(start);
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(current, "config.json")) && existsSync(join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const fromPackage = resolve(packageDirectory, "../../../");
  if (existsSync(join(fromPackage, "config.json"))) return fromPackage;
  throw new AppError({
    code: "CONFIG_NOT_FOUND",
    message: "Unable to locate config.json from the current working directory.",
    statusCode: 500,
    expose: true
  });
};
var isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var deepMerge = (base, override) => {
  const merged = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = merged[key];
    merged[key] = isObject(current) && isObject(value) ? deepMerge(current, value) : value;
  }
  return merged;
};
var readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new ValidationError(`Configuration file could not be parsed: ${path}`, {
      reason: error instanceof Error ? error.message : "unknown"
    });
  }
};
var cachedConfig;
var loadAppConfig = (options) => {
  if (cachedConfig !== void 0 && options?.reload !== true) return cachedConfig;
  const root = options?.rootDirectory ?? findWorkspaceRoot();
  const environment = options?.environment ?? (process.env.NODE_ENV === "production" ? "production" : process.env.NODE_ENV === "test" ? "test" : "development");
  const base = readJson(join(root, "config.json"));
  if (!isObject(base)) throw new ValidationError("config.json must contain a JSON object.");
  const overridePath = join(root, `config.${environment}.json`);
  const merged = existsSync(overridePath) ? deepMerge(base, (() => {
    const override = readJson(overridePath);
    if (!isObject(override)) {
      throw new ValidationError(`${overridePath} must contain a JSON object.`);
    }
    return override;
  })()) : base;
  const parsed = AppConfigSchema.safeParse(merged);
  if (!parsed.success) {
    throw new ValidationError("Application configuration is invalid.", {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    });
  }
  cachedConfig = Object.freeze(parsed.data);
  return cachedConfig;
};
var parseEnvironment = (schema) => {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const summary = parsed.error.issues.map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`).join("; ");
    throw new ValidationError(`Environment validation failed: ${summary}`);
  }
  return parsed.data;
};
var loadApiEnvironment = () => parseEnvironment(ApiEnvironmentSchema);
var loadBotEnvironment = () => parseEnvironment(BotEnvironmentSchema);
var loadWorkerEnvironment = () => parseEnvironment(WorkerEnvironmentSchema);
var loadWebEnvironment = () => parseEnvironment(WebEnvironmentSchema);
var clearConfigCacheForTests = () => {
  cachedConfig = void 0;
};
export {
  ApiEnvironmentSchema,
  AppConfigSchema,
  BotEnvironmentSchema,
  WebEnvironmentSchema,
  WorkerEnvironmentSchema,
  clearConfigCacheForTests,
  loadApiEnvironment,
  loadAppConfig,
  loadBotEnvironment,
  loadWebEnvironment,
  loadWorkerEnvironment
};
//# sourceMappingURL=index.js.map