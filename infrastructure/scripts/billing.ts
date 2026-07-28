import {
  assertPersistedPlanMatchesConfig,
  configuredPlan,
} from '@sufbot/billing';
import {
  loadAppConfig,
  loadRootEnvironment,
} from '@sufbot/config';
import { createPrismaClient } from '@sufbot/database';

type ProviderCheck = {
  provider: 'stripe' | 'paytr';
  enabled: boolean;
  configured: boolean;
  recurringCapable: boolean;
  ready: boolean;
  reasonCodes: string[];
};

loadRootEnvironment();
const config = loadAppConfig({ reload: true });
const command = process.argv[2] ?? 'config:check';

const present = (name: string): boolean => {
  const value = process.env[name];
  return value !== undefined && value.trim().length > 0;
};

const stripeCheck = (): ProviderCheck => {
  const enabled = config.billing.providers.stripe.enabled;
  const configured =
    present('STRIPE_SECRET_KEY') &&
    present('STRIPE_WEBHOOK_SECRET') &&
    present('STRIPE_PRICE_ID');
  const reasonCodes: string[] = [];
  if (!enabled) reasonCodes.push('PROVIDER_DISABLED');
  if (!configured) reasonCodes.push('CREDENTIALS_OR_PRICE_MISSING');
  reasonCodes.push('PRICE_NOT_LIVE_VERIFIED');
  reasonCodes.push('WEBHOOK_NOT_DELIVERY_VERIFIED');
  return {
    provider: 'stripe',
    enabled,
    configured,
    recurringCapable: true,
    ready: false,
    reasonCodes,
  };
};

const paytrCheck = (): ProviderCheck => {
  const enabled = config.billing.providers.paytr.enabled;
  const configured =
    present('PAYTR_MERCHANT_ID') &&
    present('PAYTR_MERCHANT_KEY') &&
    present('PAYTR_MERCHANT_SALT') &&
    present('PAYTR_CALLBACK_URL');
  const cardStorage = process.env.PAYTR_CARD_STORAGE_ENABLED === 'true';
  const recurring = process.env.PAYTR_RECURRING_ENABLED === 'true';
  const recurringCapable = configured && cardStorage && recurring;
  const reasonCodes: string[] = [];
  if (!enabled) reasonCodes.push('PROVIDER_DISABLED');
  if (!configured) reasonCodes.push('CREDENTIALS_OR_CALLBACK_MISSING');
  if (!cardStorage) reasonCodes.push('CARD_STORAGE_MERCHANT_CAPABILITY_UNVERIFIED');
  if (!recurring) reasonCodes.push('RECURRING_MERCHANT_CAPABILITY_UNVERIFIED');
  reasonCodes.push('CALLBACK_NOT_REACHABILITY_VERIFIED');
  reasonCodes.push('MERCHANT_CURRENCY_SUPPORT_NOT_VERIFIED');
  return {
    provider: 'paytr',
    enabled,
    configured,
    recurringCapable,
    ready:
      enabled &&
      configured &&
      config.billing.providers.paytr.mode === 'manual_renewal' &&
      false,
    reasonCodes,
  };
};

const printProvider = (result: ProviderCheck): void => {
  process.stdout.write(
    `${result.provider}: enabled=${String(result.enabled)} configured=${String(
      result.configured,
    )} recurringCapable=${String(result.recurringCapable)} ready=${String(
      result.ready,
    )} reasons=${result.reasonCodes.join(',')}\n`,
  );
};

const checkConfig = (): void => {
  const runtimeEnvironment =
    process.env.NODE_ENV === 'production'
      ? 'production'
      : process.env.NODE_ENV === 'test'
        ? 'test'
        : 'development';
  const plan = configuredPlan(config);
  process.stdout.write(
    `billing config valid: enabled=${String(config.billing.enabled)} environment=${
      runtimeEnvironment
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
  if (!present('DATABASE_URL')) throw new Error('DATABASE_URL_MISSING');
  const prisma = createPrismaClient(process.env.DATABASE_URL as string);
  try {
    await assertPersistedPlanMatchesConfig(prisma, config);
    process.stdout.write(`persisted billing plan matches config: ${plan.code}\n`);
  } finally {
    await prisma.$disconnect();
  }
};

const checkProviders = (): void => {
  const results = [stripeCheck(), paytrCheck()];
  results.forEach(printProvider);
  if (
    config.billing.enabled &&
    results.filter((provider) => provider.enabled).every((provider) => !provider.ready)
  ) {
    throw new Error('NO_ENABLED_BILLING_PROVIDER_IS_READY');
  }
};

try {
  switch (command) {
    case 'config:check':
      checkConfig();
      break;
    case 'providers:check':
      checkProviders();
      break;
    case 'plans:check':
      await checkPlans();
      break;
    case 'stripe:check':
      printProvider(stripeCheck());
      break;
    case 'paytr:check':
      printProvider(paytrCheck());
      break;
    default:
      throw new Error(`Unknown billing diagnostics command: ${command}`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : 'UNKNOWN_BILLING_CHECK_FAILURE';
  process.stderr.write(`billing check failed: ${message}\n`);
  process.exitCode = 1;
}
