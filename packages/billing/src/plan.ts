import type { AppConfig } from '@sufbot/config';
import type { PrismaClient } from '@sufbot/database/generated';
import { ConflictError, NotFoundError } from '@sufbot/shared';
import { PlanResponseSchema, type PlanResponse } from './contracts.js';

export const configuredPlan = (config: AppConfig): PlanResponse =>
  PlanResponseSchema.parse({
    code: config.billing.plan.code,
    displayName: config.billing.plan.displayName,
    amountMinor: config.billing.plan.priceMinor,
    currency: config.billing.plan.currency,
    interval: config.billing.plan.interval,
    intervalCount: config.billing.plan.intervalCount,
    featureSetVersion: config.billing.plan.featureSetVersion,
  });

export const syncConfiguredPlan = async (
  prisma: PrismaClient,
  config: AppConfig,
): Promise<void> => {
  const plan = configuredPlan(config);
  await prisma.billingPlan.upsert({
    where: { code: plan.code },
    create: {
      code: plan.code,
      displayName: plan.displayName,
      active: true,
      interval: 'MONTH',
      intervalCount: plan.intervalCount,
      currency: plan.currency,
      amountMinor: plan.amountMinor,
      featureSetVersion: plan.featureSetVersion,
    },
    update: {
      displayName: plan.displayName,
      active: true,
      interval: 'MONTH',
      intervalCount: plan.intervalCount,
      currency: plan.currency,
      amountMinor: plan.amountMinor,
      featureSetVersion: plan.featureSetVersion,
    },
  });
};

export const assertPersistedPlanMatchesConfig = async (
  prisma: PrismaClient,
  config: AppConfig,
): Promise<void> => {
  const expected = configuredPlan(config);
  const stored = await prisma.billingPlan.findUnique({ where: { code: expected.code } });
  if (stored === null) throw new NotFoundError('Configured billing plan');
  const matches =
    stored.active &&
    stored.displayName === expected.displayName &&
    stored.interval === 'MONTH' &&
    stored.intervalCount === expected.intervalCount &&
    stored.currency === expected.currency &&
    stored.amountMinor === expected.amountMinor &&
    stored.featureSetVersion === expected.featureSetVersion;
  if (!matches) {
    throw new ConflictError('Persisted billing plan does not match validated configuration.');
  }
};
