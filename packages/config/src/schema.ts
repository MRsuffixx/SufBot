import { z } from 'zod';
import { DiscordSnowflakeSchema, LocaleSchema } from '@sufbot/shared';

const UrlSchema = z.url().refine((value) => ['http:', 'https:'].includes(new URL(value).protocol));
const CurrencySchema = z.enum(['USD', 'TRY', 'EUR', 'GBP', 'RUB']);
const PlanLimitSchema = z.number().int().nonnegative().max(1_000_000);
const PlanLimitsSchema = z
  .object({
    automodRules: PlanLimitSchema,
    ticketPanels: PlanLimitSchema,
    customCommands: PlanLimitSchema,
    moderationHistoryDays: PlanLimitSchema,
  })
  .strict();

export const AppConfigSchema = z
  .object({
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
      supportedLocales: z.array(LocaleSchema).min(1),
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
        mode: z.enum(['auto', 'manual']),
        totalShards: z.union([z.literal('auto'), z.number().int().positive()]),
      }),
    }),
    dashboard: z.object({
      theme: z.enum(['light', 'dark', 'system']),
      allowGuildOwnerAccess: z.boolean(),
      allowManageGuildPermission: z.boolean(),
      allowedAdministrativePermissions: z.array(z.string().min(1)),
      itemsPerPage: z.number().int().min(5).max(100),
    }),
    server: z.object({
      webPort: z.number().int().min(1).max(65_535),
      apiPort: z.number().int().min(1).max(65_535),
      apiHost: z.string().min(1),
      corsAllowedOrigins: z.array(UrlSchema).min(1),
      bodyLimitBytes: z
        .number()
        .int()
        .min(1024)
        .max(10 * 1024 * 1024),
      requestTimeoutMs: z.number().int().min(1000).max(120_000),
      openApiEnabled: z.boolean(),
    }),
    security: z.object({
      rateLimits: z.object({
        enabled: z.boolean(),
        windowSeconds: z.number().int().min(1).max(3600),
        maxRequests: z.number().int().min(1).max(100_000),
      }),
      session: z.object({
        maxAgeSeconds: z.number().int().min(300).max(2_592_000),
        guildPermissionFreshnessSeconds: z.number().int().min(30).max(3600),
      }),
      auditLogRetentionDays: z.number().int().min(30).max(3650),
      internalRequestMaxAgeSeconds: z.number().int().min(5).max(300),
      maxPaginationSize: z.number().int().min(1).max(500),
    }),
    cache: z.object({
      namespace: z.string().regex(/^[a-z][a-z0-9_-]{1,30}$/),
      guildConfigTtlSeconds: z.number().int().min(10).max(86_400),
      localTtlSeconds: z.number().int().min(1).max(3600),
      invalidationChannel: z.string().min(1).max(100),
    }),
    queue: z.object({
      prefix: z.string().regex(/^[a-z][a-z0-9_-]{1,30}$/),
      defaultAttempts: z.number().int().min(1).max(20),
      backoffDelayMs: z.number().int().min(100).max(300_000),
      removeCompletedAfterSeconds: z.number().int().min(60),
      removeFailedAfterSeconds: z.number().int().min(60),
    }),
    features: z.object({
      premium: z.boolean(),
      analytics: z.boolean(),
      publicApi: z.boolean(),
      backgroundJobs: z.boolean(),
    }),
    billing: z
      .object({
        enabled: z.boolean(),
        environment: z.enum(['development', 'test', 'production']),
        plan: z
          .object({
            code: z.string().regex(/^[a-z][a-z0-9_]{2,63}$/),
            displayName: z.string().min(1).max(100),
            priceMinor: z.number().int().positive().safe(),
            currency: CurrencySchema,
            interval: z.literal('month'),
            intervalCount: z.literal(1),
            featureSetVersion: z.number().int().positive().max(10_000),
          })
          .strict(),
        providers: z
          .object({
            stripe: z
              .object({
                enabled: z.boolean(),
              })
              .strict(),
            paytr: z
              .object({
                enabled: z.boolean(),
                mode: z.enum(['recurring', 'manual_renewal']),
                priceMinor: z.number().int().positive().safe().optional(),
                currency: CurrencySchema.optional(),
              })
              .strict()
              .superRefine((provider, context) => {
                if ((provider.priceMinor === undefined) !== (provider.currency === undefined)) {
                  context.addIssue({
                    code: 'custom',
                    message: 'PayTR priceMinor and currency must be configured together.',
                  });
                }
              }),
          })
          .strict(),
        gracePeriodDays: z.number().int().min(0).max(30),
        failedPaymentRetryWindowDays: z.number().int().min(0).max(30),
        checkoutSessionTtlMinutes: z.number().int().min(5).max(60),
        entitlementCacheTtlSeconds: z.number().int().min(5).max(300),
        allowGuildTransfer: z.literal(false),
        cancellationPolicy: z.literal('end_of_period'),
        limits: z
          .object({
            free: PlanLimitsSchema,
            premium: PlanLimitsSchema,
          })
          .strict(),
      })
      .strict()
      .superRefine((billing, context) => {
        if (
          billing.enabled &&
          !billing.providers.stripe.enabled &&
          !billing.providers.paytr.enabled
        ) {
          context.addIssue({
            code: 'custom',
            path: ['providers'],
            message: 'At least one billing provider must be enabled when billing is enabled.',
          });
        }
        for (const key of Object.keys(billing.limits.free) as Array<
          keyof typeof billing.limits.free
        >) {
          if (billing.limits.premium[key] < billing.limits.free[key]) {
            context.addIssue({
              code: 'custom',
              path: ['limits', 'premium', key],
              message: 'Premium limits must not be lower than free limits.',
            });
          }
        }
      }),
    logging: z.object({
      level: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']),
      prettyDevelopmentLogs: z.boolean(),
    }),
  })
  .strict();

export type AppConfig = z.infer<typeof AppConfigSchema>;

const RuntimeEnvironmentSchema = z
  .enum(['development', 'test', 'production'])
  .default('development');
const SecretSchema = z.string().min(32);
const DatabaseUrlSchema = z.string().refine((value) => value.startsWith('postgresql://'), {
  message: 'must be a PostgreSQL connection URL',
});
const RedisUrlSchema = z
  .string()
  .refine((value) => value.startsWith('redis://') || value.startsWith('rediss://'), {
    message: 'must be a Redis connection URL',
  });
const EncryptionKeySchema = z.string().refine(
  (value) => {
    try {
      return Buffer.from(value, 'base64').length === 32;
    } catch {
      return false;
    }
  },
  { message: 'must be a base64-encoded 32-byte key' },
);
const emptyStringToUndefined = (value: unknown): unknown => (value === '' ? undefined : value);
const OptionalSecretSchema = z.preprocess(emptyStringToUndefined, SecretSchema.optional());
const OptionalEncryptionKeySchema = z.preprocess(
  emptyStringToUndefined,
  EncryptionKeySchema.optional(),
);
const OptionalUrlSchema = z.preprocess(emptyStringToUndefined, UrlSchema.optional());
const OptionalStringSchema = z.preprocess(
  emptyStringToUndefined,
  z.string().min(1).max(255).optional(),
);
const OptionalBooleanSchema = z.preprocess(
  emptyStringToUndefined,
  z.stringbool().default(false),
);
const BillingServerEnvironmentShape = {
  STRIPE_SECRET_KEY: OptionalSecretSchema,
  STRIPE_PUBLISHABLE_KEY: OptionalStringSchema,
  STRIPE_WEBHOOK_SECRET: OptionalSecretSchema,
  STRIPE_PRICE_ID: OptionalStringSchema,
  PAYTR_MERCHANT_ID: OptionalStringSchema,
  PAYTR_MERCHANT_KEY: OptionalSecretSchema,
  PAYTR_MERCHANT_SALT: OptionalSecretSchema,
  PAYTR_CALLBACK_URL: OptionalUrlSchema,
  PAYTR_RECURRING_ENABLED: OptionalBooleanSchema,
  PAYTR_CARD_STORAGE_ENABLED: OptionalBooleanSchema,
  BILLING_INTERNAL_SIGNING_SECRET: OptionalSecretSchema,
  BILLING_ENCRYPTION_KEY: OptionalEncryptionKeySchema,
} as const;
const SnowflakeListSchema = z
  .string()
  .default('')
  .transform((value, context) => {
    const ids = value
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    for (const id of ids) {
      if (!DiscordSnowflakeSchema.safeParse(id).success) {
        context.addIssue({ code: 'custom', message: `Invalid Discord snowflake: ${id}` });
        return z.NEVER;
      }
    }
    return [...new Set(ids)];
  });

const CommonEnvironmentShape = {
  NODE_ENV: RuntimeEnvironmentSchema,
  DATABASE_URL: DatabaseUrlSchema,
  REDIS_URL: RedisUrlSchema,
  SENTRY_DSN: z.string().optional(),
} as const;

export const ApiEnvironmentSchema = z.object({
  ...CommonEnvironmentShape,
  INTERNAL_API_SECRET: SecretSchema,
  WEBHOOK_SIGNING_SECRET: SecretSchema,
  ...BillingServerEnvironmentShape,
});

export const BotEnvironmentSchema = z
  .object({
    ...CommonEnvironmentShape,
    DISCORD_BOT_TOKEN: SecretSchema,
    DISCORD_APPLICATION_ID: DiscordSnowflakeSchema.optional(),
    DISCORD_CLIENT_ID: DiscordSnowflakeSchema,
    DISCORD_PUBLIC_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/),
    DISCORD_DEVELOPMENT_GUILD_IDS: SnowflakeListSchema,
    BOT_OWNER_DISCORD_IDS: SnowflakeListSchema,
    BOT_DEVELOPER_DISCORD_IDS: SnowflakeListSchema,
    PLATFORM_ADMIN_DISCORD_IDS: SnowflakeListSchema,
  })
  .superRefine((environment, context) => {
    if (
      environment.DISCORD_APPLICATION_ID !== undefined &&
      environment.DISCORD_APPLICATION_ID !== environment.DISCORD_CLIENT_ID
    ) {
      context.addIssue({
        code: 'custom',
        path: ['DISCORD_APPLICATION_ID'],
        message: 'must match DISCORD_CLIENT_ID',
      });
    }
  });

export const WorkerEnvironmentSchema = z.object({
  ...CommonEnvironmentShape,
  ...BillingServerEnvironmentShape,
});

export const WebEnvironmentSchema = z
  .object({
    ...CommonEnvironmentShape,
    DISCORD_APPLICATION_ID: DiscordSnowflakeSchema.optional(),
    DISCORD_CLIENT_ID: DiscordSnowflakeSchema,
    DISCORD_CLIENT_SECRET: SecretSchema,
    DISCORD_PUBLIC_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/),
    AUTH_SECRET: SecretSchema,
    AUTH_TRUST_HOST: z.stringbool().default(true),
    INTERNAL_API_SECRET: SecretSchema,
    ENCRYPTION_KEY: EncryptionKeySchema,
    SESSION_ENCRYPTION_KEY: EncryptionKeySchema,
    BOT_OWNER_DISCORD_IDS: SnowflakeListSchema,
    BOT_DEVELOPER_DISCORD_IDS: SnowflakeListSchema,
    PLATFORM_ADMIN_DISCORD_IDS: SnowflakeListSchema,
    ...BillingServerEnvironmentShape,
  })
  .superRefine((environment, context) => {
    if (
      environment.DISCORD_APPLICATION_ID !== undefined &&
      environment.DISCORD_APPLICATION_ID !== environment.DISCORD_CLIENT_ID
    ) {
      context.addIssue({
        code: 'custom',
        path: ['DISCORD_APPLICATION_ID'],
        message: 'must match DISCORD_CLIENT_ID',
      });
    }
  });

export type ApiEnvironment = z.infer<typeof ApiEnvironmentSchema>;
export type BotEnvironment = z.infer<typeof BotEnvironmentSchema>;
export type WorkerEnvironment = z.infer<typeof WorkerEnvironmentSchema>;
export type WebEnvironment = z.infer<typeof WebEnvironmentSchema>;

export const canonicalDiscordApplicationId = (environment: {
  DISCORD_APPLICATION_ID?: string | undefined;
  DISCORD_CLIENT_ID: string;
}): string => environment.DISCORD_APPLICATION_ID ?? environment.DISCORD_CLIENT_ID;

export const resolveDiscordDevelopmentGuildIds = (
  environment: Pick<BotEnvironment, 'DISCORD_DEVELOPMENT_GUILD_IDS'>,
  configuredGuildIds: readonly string[],
): string[] =>
  environment.DISCORD_DEVELOPMENT_GUILD_IDS.length > 0
    ? environment.DISCORD_DEVELOPMENT_GUILD_IDS
    : [...configuredGuildIds];
