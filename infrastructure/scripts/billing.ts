import {
  PaytrBillingProvider,
  StripeBillingProvider,
  assertPersistedPlanMatchesConfig,
  configuredPlan,
  syncConfiguredPlan,
  type CurrencyCode,
  type ProviderCapabilities,
} from '../../packages/billing/src/index.js';
import { loadAppConfig, loadRootEnvironment } from '@sufbot/config';
import { createPrismaClient } from '@sufbot/database';

loadRootEnvironment();
const config = loadAppConfig({ reload: true });
const command = process.argv[2] ?? 'config:check';
const environment =
  process.env.NODE_ENV === 'production'
    ? 'production'
    : process.env.NODE_ENV === 'test'
      ? 'test'
      : 'development';

const value = (name: string): string | undefined => {
  const candidate = process.env[name]?.trim();
  return candidate === undefined || candidate === '' ? undefined : candidate;
};

const enabled = (name: string): boolean => value(name)?.toLowerCase() === 'true';
const approvedCurrencies = (): CurrencyCode[] => {
  const supported = new Set(['USD', 'TRY', 'EUR', 'GBP', 'RUB']);
  return (value('PAYTR_APPROVED_CURRENCIES') ?? '')
    .split(',')
    .map((currency) => currency.trim().toUpperCase())
    .filter((currency): currency is CurrencyCode => supported.has(currency));
};

const stripeSecretKey = value('STRIPE_SECRET_KEY');
const stripeWebhookSecret = value('STRIPE_WEBHOOK_SECRET');
const stripePriceId = value('STRIPE_PRICE_ID');
const stripePortalConfigurationId = value('STRIPE_PORTAL_CONFIGURATION_ID');
const stripeProvider = new StripeBillingProvider({
  config,
  environment,
  ...(stripeSecretKey === undefined ? {} : { secretKey: stripeSecretKey }),
  ...(stripeWebhookSecret === undefined ? {} : { webhookSecret: stripeWebhookSecret }),
  ...(stripePriceId === undefined ? {} : { priceId: stripePriceId }),
  ...(stripePortalConfigurationId === undefined
    ? {}
    : { portalConfigurationId: stripePortalConfigurationId }),
});

const paytrMerchantId = value('PAYTR_MERCHANT_ID');
const paytrMerchantKey = value('PAYTR_MERCHANT_KEY');
const paytrMerchantSalt = value('PAYTR_MERCHANT_SALT');
const paytrCallbackUrl = value('PAYTR_CALLBACK_URL');
const paytrProvider = new PaytrBillingProvider({
  config,
  environment,
  ...(paytrMerchantId === undefined ? {} : { merchantId: paytrMerchantId }),
  ...(paytrMerchantKey === undefined ? {} : { merchantKey: paytrMerchantKey }),
  ...(paytrMerchantSalt === undefined ? {} : { merchantSalt: paytrMerchantSalt }),
  ...(paytrCallbackUrl === undefined ? {} : { callbackUrl: paytrCallbackUrl }),
  iframeCapabilityEnabled: enabled('PAYTR_IFRAME_ENABLED'),
  recurringCapabilityEnabled: enabled('PAYTR_RECURRING_ENABLED'),
  cardStorageCapabilityEnabled: enabled('PAYTR_CARD_STORAGE_ENABLED'),
  approvedCurrencies: approvedCurrencies(),
});

const printProvider = (result: ProviderCapabilities): void => {
  process.stdout.write(
    `${result.provider.toLowerCase()}: configured=${String(
      result.configured,
    )} initialPayment=${String(result.hostedInitialPayment)} cardStorage=${String(
      result.cardStorage,
    )} recurring=${String(result.recurring)} testMode=${String(
      result.testMode,
    )} callbackConfigured=${String(result.callbackConfigured)} callbackReachable=${
      result.callbackReachable === null ? 'unverified' : String(result.callbackReachable)
    } currencies=${result.supportedCurrencies.join(',') || 'none'} ready=${String(
      result.ready,
    )} reasons=${result.reasonCodes.join(',') || 'none'}\n`,
  );
};

const checkConfig = (): void => {
  const plan = configuredPlan(config);
  process.stdout.write(
    `billing config valid: enabled=${String(config.billing.enabled)} environment=${
      environment
    } plan=${plan.code} amountMinor=${plan.amountMinor} currency=${plan.currency} interval=${
      plan.interval
    }\n`,
  );
};

const checkPlans = async (): Promise<void> => {
  const plan = configuredPlan(config);
  if (!config.billing.enabled) {
    process.stdout.write(
      `billing plan config valid: ${plan.code} ${plan.amountMinor} ${plan.currency}; persistence check skipped because billing is disabled\n`,
    );
    return;
  }
  const databaseUrl = value('DATABASE_URL');
  if (databaseUrl === undefined) throw new Error('DATABASE_URL_MISSING');
  const prisma = createPrismaClient(databaseUrl);
  try {
    await assertPersistedPlanMatchesConfig(prisma, config);
    process.stdout.write(`persisted billing plan matches config: ${plan.code}\n`);
  } finally {
    await prisma.$disconnect();
  }
};

const syncPlans = async (): Promise<void> => {
  const plan = configuredPlan(config);
  const databaseUrl = value('DATABASE_URL');
  if (databaseUrl === undefined) throw new Error('DATABASE_URL_MISSING');
  const prisma = createPrismaClient(databaseUrl);
  try {
    await syncConfiguredPlan(prisma, config);
    await assertPersistedPlanMatchesConfig(prisma, config);
    process.stdout.write(`persisted billing plan synchronized from config: ${plan.code}\n`);
  } finally {
    await prisma.$disconnect();
  }
};

const checkProviders = async (): Promise<ProviderCapabilities[]> => {
  const results = await Promise.all([
    stripeProvider.checkCapabilities(),
    paytrProvider.checkCapabilities(),
  ]);
  results.forEach(printProvider);
  if (
    config.billing.enabled &&
    results
      .filter((provider) =>
        provider.provider === 'STRIPE'
          ? config.billing.providers.stripe.enabled
          : config.billing.providers.paytr.enabled,
      )
      .every((provider) => !provider.ready)
  ) {
    throw new Error('NO_ENABLED_BILLING_PROVIDER_IS_READY');
  }
  return results;
};

try {
  switch (command) {
    case 'config:check':
      checkConfig();
      break;
    case 'providers:check':
      await checkProviders();
      break;
    case 'plans:check':
      await checkPlans();
      break;
    case 'plans:sync':
      await syncPlans();
      break;
    case 'stripe:check':
      printProvider(await stripeProvider.checkCapabilities());
      break;
    case 'paytr:check':
      printProvider(await paytrProvider.checkCapabilities());
      break;
    default:
      throw new Error(`Unknown billing diagnostics command: ${command}`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : 'UNKNOWN_BILLING_CHECK_FAILURE';
  process.stderr.write(`billing check failed: ${message}\n`);
  process.exitCode = 1;
}
