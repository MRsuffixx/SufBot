import { loadApiEnvironment, loadAppConfig } from '@sufbot/config';
import { DistributedCache } from '@sufbot/cache';
import { StripeBillingProvider } from '@sufbot/billing';
import { disconnectPrisma, getPrismaClient } from '@sufbot/database';
import { createRuntimeLogger } from '@sufbot/logger/runtime';
import { buildApi } from './app.js';

const env = loadApiEnvironment();
const config = loadAppConfig();
const logger = await createRuntimeLogger(
  { app: 'api', environment: env.NODE_ENV, version: '0.1.0' },
  {
    level: config.logging.level,
    pretty: env.NODE_ENV === 'development' && config.logging.prettyDevelopmentLogs,
  },
);
const prisma = getPrismaClient(env.DATABASE_URL);
const cache = new DistributedCache(env.REDIS_URL, {
  namespace: `${config.cache.namespace}:${env.NODE_ENV}`,
  localTtlSeconds: config.cache.localTtlSeconds,
  redisTtlSeconds: config.cache.guildConfigTtlSeconds,
  invalidationChannel: config.cache.invalidationChannel,
  logger,
});
const stripeProvider = new StripeBillingProvider({
  config,
  environment: env.NODE_ENV,
  ...(env.STRIPE_SECRET_KEY === undefined
    ? {}
    : { secretKey: env.STRIPE_SECRET_KEY }),
  ...(env.STRIPE_WEBHOOK_SECRET === undefined
    ? {}
    : { webhookSecret: env.STRIPE_WEBHOOK_SECRET }),
  ...(env.STRIPE_PRICE_ID === undefined ? {} : { priceId: env.STRIPE_PRICE_ID }),
  ...(env.STRIPE_PORTAL_CONFIGURATION_ID === undefined
    ? {}
    : { portalConfigurationId: env.STRIPE_PORTAL_CONFIGURATION_ID }),
});
const billingProviders = new Map([['STRIPE' as const, stripeProvider]]);

await cache.connect();
const app = await buildApi({
  config,
  env,
  prisma,
  cache,
  logger,
  billingProviders,
});
let stopping = false;

const shutdown = async (signal: string): Promise<void> => {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'graceful shutdown started');
  const forceExit = setTimeout(() => {
    logger.fatal('graceful shutdown timed out');
    process.exit(1);
  }, 15_000);
  forceExit.unref();
  await app.close();
  await cache.close();
  await disconnectPrisma();
  clearTimeout(forceExit);
  logger.info('graceful shutdown completed');
};

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (error) => {
  logger.fatal({ err: error }, 'unhandled rejection');
  void shutdown('unhandledRejection').then(() => process.exit(1));
});
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'uncaught exception');
  void shutdown('uncaughtException').then(() => process.exit(1));
});

await app.listen({ host: config.server.apiHost, port: config.server.apiPort });
logger.info({ port: config.server.apiPort }, 'SufBot API is ready');
