import 'server-only';

import { DistributedCache } from '@sufbot/cache';
import { StripeBillingProvider, type BillingProvider, type BillingProviderName } from '@sufbot/billing';
import { loadAppConfig, loadWebEnvironment } from '@sufbot/config';
import { getPrismaClient } from '@sufbot/database';
import { createLogger } from '@sufbot/logger';

export const appConfig = loadAppConfig();
export const webEnvironment = loadWebEnvironment();
export const webLogger = createLogger(
  { app: 'web', environment: webEnvironment.NODE_ENV, version: '0.1.0' },
  {
    level: appConfig.logging.level,
  },
);
export const prisma = getPrismaClient(webEnvironment.DATABASE_URL);
const stripeBillingProvider = new StripeBillingProvider({
  config: appConfig,
  environment: webEnvironment.NODE_ENV,
  ...(webEnvironment.STRIPE_SECRET_KEY === undefined
    ? {}
    : { secretKey: webEnvironment.STRIPE_SECRET_KEY }),
  ...(webEnvironment.STRIPE_WEBHOOK_SECRET === undefined
    ? {}
    : { webhookSecret: webEnvironment.STRIPE_WEBHOOK_SECRET }),
  ...(webEnvironment.STRIPE_PRICE_ID === undefined
    ? {}
    : { priceId: webEnvironment.STRIPE_PRICE_ID }),
  ...(webEnvironment.STRIPE_PORTAL_CONFIGURATION_ID === undefined
    ? {}
    : { portalConfigurationId: webEnvironment.STRIPE_PORTAL_CONFIGURATION_ID }),
});
export const billingProviders: ReadonlyMap<BillingProviderName, BillingProvider> = new Map([
  ['STRIPE', stripeBillingProvider],
]);
export const cache = new DistributedCache(webEnvironment.REDIS_URL, {
  namespace: `${appConfig.cache.namespace}:${webEnvironment.NODE_ENV}`,
  localTtlSeconds: appConfig.cache.localTtlSeconds,
  redisTtlSeconds: appConfig.cache.guildConfigTtlSeconds,
  invalidationChannel: appConfig.cache.invalidationChannel,
  logger: webLogger,
});

let cacheConnection: Promise<void> | undefined;
export const ensureCacheConnection = (): Promise<void> => {
  cacheConnection ??= cache.connect().catch((error: unknown) => {
    cacheConnection = undefined;
    throw error;
  });
  return cacheConnection;
};
