import { z } from 'zod';

declare const AppConfigSchema: z.ZodObject<{
    $schemaVersion: z.ZodLiteral<1>;
    application: z.ZodObject<{
        name: z.ZodString;
        description: z.ZodString;
        ownerName: z.ZodString;
        ownerDiscordUsername: z.ZodString;
        ownerGitHubUrl: z.ZodURL;
        websiteUrl: z.ZodURL;
        apiUrl: z.ZodURL;
        defaultLocale: z.ZodEnum<{
            en: "en";
            tr: "tr";
        }>;
        supportedLocales: z.ZodArray<z.ZodEnum<{
            en: "en";
            tr: "tr";
        }>>;
    }, z.core.$strip>;
    discord: z.ZodObject<{
        defaultPrefix: z.ZodString;
        enablePrefixCommands: z.ZodBoolean;
        enableSlashCommands: z.ZodBoolean;
        registerCommandsGlobally: z.ZodBoolean;
        developmentGuildIds: z.ZodArray<z.ZodString>;
        requiredInvitePermissions: z.ZodArray<z.ZodString>;
        intents: z.ZodArray<z.ZodString>;
        partials: z.ZodArray<z.ZodString>;
        sharding: z.ZodObject<{
            enabled: z.ZodBoolean;
            mode: z.ZodEnum<{
                auto: "auto";
                manual: "manual";
            }>;
            totalShards: z.ZodUnion<readonly [z.ZodLiteral<"auto">, z.ZodNumber]>;
        }, z.core.$strip>;
    }, z.core.$strip>;
    dashboard: z.ZodObject<{
        theme: z.ZodEnum<{
            light: "light";
            dark: "dark";
            system: "system";
        }>;
        allowGuildOwnerAccess: z.ZodBoolean;
        allowManageGuildPermission: z.ZodBoolean;
        allowedAdministrativePermissions: z.ZodArray<z.ZodString>;
        itemsPerPage: z.ZodNumber;
    }, z.core.$strip>;
    server: z.ZodObject<{
        webPort: z.ZodNumber;
        apiPort: z.ZodNumber;
        apiHost: z.ZodString;
        corsAllowedOrigins: z.ZodArray<z.ZodURL>;
        bodyLimitBytes: z.ZodNumber;
        requestTimeoutMs: z.ZodNumber;
        openApiEnabled: z.ZodBoolean;
    }, z.core.$strip>;
    security: z.ZodObject<{
        rateLimits: z.ZodObject<{
            enabled: z.ZodBoolean;
            windowSeconds: z.ZodNumber;
            maxRequests: z.ZodNumber;
        }, z.core.$strip>;
        session: z.ZodObject<{
            maxAgeSeconds: z.ZodNumber;
            guildPermissionFreshnessSeconds: z.ZodNumber;
        }, z.core.$strip>;
        auditLogRetentionDays: z.ZodNumber;
        internalRequestMaxAgeSeconds: z.ZodNumber;
        maxPaginationSize: z.ZodNumber;
    }, z.core.$strip>;
    cache: z.ZodObject<{
        namespace: z.ZodString;
        guildConfigTtlSeconds: z.ZodNumber;
        localTtlSeconds: z.ZodNumber;
        invalidationChannel: z.ZodString;
    }, z.core.$strip>;
    queue: z.ZodObject<{
        prefix: z.ZodString;
        defaultAttempts: z.ZodNumber;
        backoffDelayMs: z.ZodNumber;
        removeCompletedAfterSeconds: z.ZodNumber;
        removeFailedAfterSeconds: z.ZodNumber;
    }, z.core.$strip>;
    features: z.ZodObject<{
        premium: z.ZodBoolean;
        analytics: z.ZodBoolean;
        publicApi: z.ZodBoolean;
        backgroundJobs: z.ZodBoolean;
    }, z.core.$strip>;
    logging: z.ZodObject<{
        level: z.ZodEnum<{
            error: "error";
            fatal: "fatal";
            warn: "warn";
            info: "info";
            debug: "debug";
            trace: "trace";
            silent: "silent";
        }>;
        prettyDevelopmentLogs: z.ZodBoolean;
    }, z.core.$strip>;
}, z.core.$strict>;
type AppConfig = z.infer<typeof AppConfigSchema>;
declare const ApiEnvironmentSchema: z.ZodObject<{
    INTERNAL_API_SECRET: z.ZodString;
    WEBHOOK_SIGNING_SECRET: z.ZodString;
    NODE_ENV: z.ZodDefault<z.ZodEnum<{
        development: "development";
        test: "test";
        production: "production";
    }>>;
    DATABASE_URL: z.ZodString;
    REDIS_URL: z.ZodString;
    SENTRY_DSN: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
declare const BotEnvironmentSchema: z.ZodObject<{
    DISCORD_BOT_TOKEN: z.ZodString;
    DISCORD_CLIENT_ID: z.ZodString;
    BOT_OWNER_DISCORD_IDS: z.ZodPipe<z.ZodDefault<z.ZodString>, z.ZodTransform<string[], string>>;
    BOT_DEVELOPER_DISCORD_IDS: z.ZodPipe<z.ZodDefault<z.ZodString>, z.ZodTransform<string[], string>>;
    PLATFORM_ADMIN_DISCORD_IDS: z.ZodPipe<z.ZodDefault<z.ZodString>, z.ZodTransform<string[], string>>;
    NODE_ENV: z.ZodDefault<z.ZodEnum<{
        development: "development";
        test: "test";
        production: "production";
    }>>;
    DATABASE_URL: z.ZodString;
    REDIS_URL: z.ZodString;
    SENTRY_DSN: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
declare const WorkerEnvironmentSchema: z.ZodObject<{
    NODE_ENV: z.ZodDefault<z.ZodEnum<{
        development: "development";
        test: "test";
        production: "production";
    }>>;
    DATABASE_URL: z.ZodString;
    REDIS_URL: z.ZodString;
    SENTRY_DSN: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
declare const WebEnvironmentSchema: z.ZodObject<{
    DISCORD_CLIENT_ID: z.ZodString;
    DISCORD_CLIENT_SECRET: z.ZodString;
    AUTH_SECRET: z.ZodString;
    AUTH_TRUST_HOST: z.ZodDefault<z.ZodCodec<z.ZodString, z.ZodBoolean>>;
    INTERNAL_API_SECRET: z.ZodString;
    ENCRYPTION_KEY: z.ZodString;
    SESSION_ENCRYPTION_KEY: z.ZodString;
    BOT_OWNER_DISCORD_IDS: z.ZodPipe<z.ZodDefault<z.ZodString>, z.ZodTransform<string[], string>>;
    BOT_DEVELOPER_DISCORD_IDS: z.ZodPipe<z.ZodDefault<z.ZodString>, z.ZodTransform<string[], string>>;
    PLATFORM_ADMIN_DISCORD_IDS: z.ZodPipe<z.ZodDefault<z.ZodString>, z.ZodTransform<string[], string>>;
    NODE_ENV: z.ZodDefault<z.ZodEnum<{
        development: "development";
        test: "test";
        production: "production";
    }>>;
    DATABASE_URL: z.ZodString;
    REDIS_URL: z.ZodString;
    SENTRY_DSN: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type ApiEnvironment = z.infer<typeof ApiEnvironmentSchema>;
type BotEnvironment = z.infer<typeof BotEnvironmentSchema>;
type WorkerEnvironment = z.infer<typeof WorkerEnvironmentSchema>;
type WebEnvironment = z.infer<typeof WebEnvironmentSchema>;

declare const loadAppConfig: (options?: {
    rootDirectory?: string;
    environment?: "development" | "test" | "production";
    reload?: boolean;
}) => AppConfig;
declare const loadApiEnvironment: () => ApiEnvironment;
declare const loadBotEnvironment: () => BotEnvironment;
declare const loadWorkerEnvironment: () => WorkerEnvironment;
declare const loadWebEnvironment: () => WebEnvironment;
declare const clearConfigCacheForTests: () => void;

export { type ApiEnvironment, ApiEnvironmentSchema, type AppConfig, AppConfigSchema, type BotEnvironment, BotEnvironmentSchema, type WebEnvironment, WebEnvironmentSchema, type WorkerEnvironment, WorkerEnvironmentSchema, clearConfigCacheForTests, loadApiEnvironment, loadAppConfig, loadBotEnvironment, loadWebEnvironment, loadWorkerEnvironment };
