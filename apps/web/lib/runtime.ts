import 'server-only';

import { DistributedCache } from '@sufbot/cache';
import {
  PaytrBillingProvider,
  StripeBillingProvider,
  type BillingProvider,
  type BillingProviderName,
} from '@sufbot/billing';
import { loadAppConfig, loadWebEnvironment } from '@sufbot/config';
import { getPrismaClient } from '@sufbot/database';
import { createLogger } from '@sufbot/logger';
import { QueueRegistry } from '@sufbot/queue';

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
const paytrBillingProvider = new PaytrBillingProvider({
  config: appConfig,
  environment: webEnvironment.NODE_ENV,
  ...(webEnvironment.PAYTR_MERCHANT_ID === undefined
    ? {}
    : { merchantId: webEnvironment.PAYTR_MERCHANT_ID }),
  ...(webEnvironment.PAYTR_MERCHANT_KEY === undefined
    ? {}
    : { merchantKey: webEnvironment.PAYTR_MERCHANT_KEY }),
  ...(webEnvironment.PAYTR_MERCHANT_SALT === undefined
    ? {}
    : { merchantSalt: webEnvironment.PAYTR_MERCHANT_SALT }),
  ...(webEnvironment.PAYTR_CALLBACK_URL === undefined
    ? {}
    : { callbackUrl: webEnvironment.PAYTR_CALLBACK_URL }),
  iframeCapabilityEnabled: webEnvironment.PAYTR_IFRAME_ENABLED,
  recurringCapabilityEnabled: webEnvironment.PAYTR_RECURRING_ENABLED,
  cardStorageCapabilityEnabled: webEnvironment.PAYTR_CARD_STORAGE_ENABLED,
  approvedCurrencies: webEnvironment.PAYTR_APPROVED_CURRENCIES,
});
export const billingProviders: ReadonlyMap<BillingProviderName, BillingProvider> = new Map<
  BillingProviderName,
  BillingProvider
>([
  ['STRIPE', stripeBillingProvider],
  ['PAYTR', paytrBillingProvider],
]);
export const cache = new DistributedCache(webEnvironment.REDIS_URL, {
  namespace: `${appConfig.cache.namespace}:${webEnvironment.NODE_ENV}`,
  localTtlSeconds: appConfig.cache.localTtlSeconds,
  redisTtlSeconds: appConfig.cache.guildConfigTtlSeconds,
  invalidationChannel: appConfig.cache.invalidationChannel,
  logger: webLogger,
});
export const onboardingQueue = new QueueRegistry(webEnvironment.REDIS_URL, appConfig.queue);

let cacheConnection: Promise<void> | undefined;
export const ensureCacheConnection = (): Promise<void> => {
  cacheConnection ??= cache.connect().catch((error: unknown) => {
    cacheConnection = undefined;
    throw error;
  });
  return cacheConnection;
};
