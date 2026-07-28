import { DistributedCache } from '@sufbot/cache';
import {
  BillingManagementService,
  PaytrBillingProvider,
  StripeBillingProvider,
  type BillingProvider,
  type BillingProviderName,
} from '@sufbot/billing';
import { loadAppConfig, loadRootEnvironment, loadWorkerEnvironment } from '@sufbot/config';
import { createPrismaClient } from '@sufbot/database';
import { createLogger } from '@sufbot/logger';
import { createId } from '@sufbot/shared';

loadRootEnvironment();
const env = loadWorkerEnvironment();
const config = loadAppConfig({ reload: true });
const command = process.argv[2] ?? 'help';
const apply = process.argv.includes('--apply');
const option = (name: string): string | undefined => {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
};
const logger = createLogger(
  { app: 'worker', environment: env.NODE_ENV },
  { level: config.logging.level },
);
const prisma = createPrismaClient(env.DATABASE_URL);
const cache = new DistributedCache(env.REDIS_URL, {
  namespace: `${config.cache.namespace}:${env.NODE_ENV}`,
  localTtlSeconds: config.cache.localTtlSeconds,
  redisTtlSeconds: config.billing.entitlementCacheTtlSeconds,
  invalidationChannel: config.cache.invalidationChannel,
  logger,
});
const providers: ReadonlyMap<BillingProviderName, BillingProvider> = new Map<
  BillingProviderName,
  BillingProvider
>([
  [
    'STRIPE',
    new StripeBillingProvider({
      config,
      environment: env.NODE_ENV,
      ...(env.STRIPE_SECRET_KEY === undefined ? {} : { secretKey: env.STRIPE_SECRET_KEY }),
      ...(env.STRIPE_WEBHOOK_SECRET === undefined
        ? {}
        : { webhookSecret: env.STRIPE_WEBHOOK_SECRET }),
      ...(env.STRIPE_PRICE_ID === undefined ? {} : { priceId: env.STRIPE_PRICE_ID }),
      ...(env.STRIPE_PORTAL_CONFIGURATION_ID === undefined
        ? {}
        : { portalConfigurationId: env.STRIPE_PORTAL_CONFIGURATION_ID }),
    }),
  ],
  [
    'PAYTR',
    new PaytrBillingProvider({
      config,
      environment: env.NODE_ENV,
      ...(env.PAYTR_MERCHANT_ID === undefined ? {} : { merchantId: env.PAYTR_MERCHANT_ID }),
      ...(env.PAYTR_MERCHANT_KEY === undefined ? {} : { merchantKey: env.PAYTR_MERCHANT_KEY }),
      ...(env.PAYTR_MERCHANT_SALT === undefined ? {} : { merchantSalt: env.PAYTR_MERCHANT_SALT }),
      ...(env.PAYTR_CALLBACK_URL === undefined ? {} : { callbackUrl: env.PAYTR_CALLBACK_URL }),
      iframeCapabilityEnabled: env.PAYTR_IFRAME_ENABLED,
      recurringCapabilityEnabled: env.PAYTR_RECURRING_ENABLED,
      cardStorageCapabilityEnabled: env.PAYTR_CARD_STORAGE_ENABLED,
      approvedCurrencies: env.PAYTR_APPROVED_CURRENCIES,
    }),
  ],
]);

try {
  if (command === 'events:failed') {
    const events = await prisma.billingProviderEvent.findMany({
      where: { processingStatus: { in: ['FAILED', 'DEAD_LETTERED'] } },
      orderBy: { receivedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        provider: true,
        eventType: true,
        failureCode: true,
        receivedAt: true,
        correlationId: true,
      },
    });
    process.stdout.write(`${JSON.stringify(events, null, 2)}\n`);
  } else if (command === 'reconcile') {
    const subscriptionId = option('subscription');
    if (subscriptionId === undefined) {
      throw new Error('Pass --subscription=<internal-uuid>.');
    }
    const subscription = await prisma.guildSubscription.findUnique({
      where: { id: subscriptionId },
    });
    if (subscription === null || subscription.providerSubscriptionId === null) {
      throw new Error('BOUND_SUBSCRIPTION_NOT_FOUND');
    }
    const provider = providers.get(subscription.provider);
    if (provider === undefined) throw new Error('PROVIDER_NOT_REGISTERED');
    const snapshot = await provider.retrieveSubscription(subscription.providerSubscriptionId);
    process.stdout.write(
      `${JSON.stringify(
        {
          mode: apply ? 'apply' : 'dry-run',
          environment: env.NODE_ENV,
          subscriptionId: subscription.id,
          guildId: subscription.guildId,
          provider: subscription.provider,
          currentStatus: subscription.status,
          providerStatus: snapshot.status,
          cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
          periodEnd: snapshot.currentPeriodEnd,
        },
        null,
        2,
      )}\n`,
    );
    if (!apply) {
      process.stdout.write('No database state changed. Re-run with --apply to reconcile.\n');
    } else {
      await cache.connect();
      await new BillingManagementService(prisma, config, providers, cache).reconcileAsSystem({
        subscriptionId,
        requestId: createId('req'),
      });
      process.stdout.write('Authoritative provider state reconciled and audited.\n');
    }
  } else {
    throw new Error('Use reconcile or events:failed.');
  }
} finally {
  await cache.close().catch(() => undefined);
  await prisma.$disconnect();
}
