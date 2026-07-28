import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  EntitlementService,
  PremiumEntitlement,
  SubscriptionReconciliationService,
  entitlementsForFeatureSet,
} from '@sufbot/billing';
import { loadAppConfig } from '@sufbot/config';
import { createPrismaClient, type PrismaClient } from '@sufbot/database';
import { getSafeLocalTestDatabaseUrl } from './environment.js';

const databaseUrl = getSafeLocalTestDatabaseUrl();
const run = databaseUrl === undefined ? describe.skip : describe;

run('billing PostgreSQL invariants', () => {
  let prisma: PrismaClient;
  let purchaserUserId: string;
  let planId: string;
  const config = loadAppConfig({ environment: 'test', reload: true });
  const purchaserDiscordId = '981000000000000001';
  const guildA = '981000000000000010';
  const guildB = '981000000000000011';

  const createSubscription = async (guildId: string, providerReference: string) =>
    prisma.guildSubscription.create({
      data: {
        guildId,
        purchaserUserId,
        billingPlanId: planId,
        planCode: config.billing.plan.code,
        planDisplayNameSnapshot: config.billing.plan.displayName,
        amountMinorSnapshot: config.billing.plan.priceMinor,
        currencySnapshot: config.billing.plan.currency,
        featureSetVersion: config.billing.plan.featureSetVersion,
        provider: 'STRIPE',
        providerSubscriptionId: providerReference,
      },
    });

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl as string);
    const user = await prisma.user.upsert({
      where: { discordId: purchaserDiscordId },
      create: { discordId: purchaserDiscordId, displayName: 'Billing integration user' },
      update: { deletedAt: null },
    });
    purchaserUserId = user.id;
    await prisma.guild.createMany({
      data: [
        { id: guildA, name: 'Billing A', ownerDiscordId: purchaserDiscordId, botInstalled: true },
        { id: guildB, name: 'Billing B', ownerDiscordId: purchaserDiscordId, botInstalled: true },
      ],
      skipDuplicates: true,
    });
    const plan = await prisma.billingPlan.upsert({
      where: { code: config.billing.plan.code },
      create: {
        code: config.billing.plan.code,
        displayName: config.billing.plan.displayName,
        interval: 'MONTH',
        intervalCount: 1,
        currency: config.billing.plan.currency,
        amountMinor: config.billing.plan.priceMinor,
        featureSetVersion: config.billing.plan.featureSetVersion,
      },
      update: {
        displayName: config.billing.plan.displayName,
        active: true,
        currency: config.billing.plan.currency,
        amountMinor: config.billing.plan.priceMinor,
        featureSetVersion: config.billing.plan.featureSetVersion,
      },
    });
    planId = plan.id;
  });

  beforeEach(async () => {
    await prisma.billingAuditEvent.deleteMany({ where: { guildId: { in: [guildA, guildB] } } });
    await prisma.checkoutSession.deleteMany({ where: { guildId: { in: [guildA, guildB] } } });
    await prisma.paymentTransaction.deleteMany({ where: { guildId: { in: [guildA, guildB] } } });
    await prisma.guildEntitlement.deleteMany({ where: { guildId: { in: [guildA, guildB] } } });
    await prisma.guildSubscription.deleteMany({ where: { guildId: { in: [guildA, guildB] } } });
    await prisma.billingProviderEvent.deleteMany({
      where: { correlationId: { startsWith: 'billing-integration-' } },
    });
  });

  afterAll(async () => {
    await prisma.billingAuditEvent.deleteMany({ where: { guildId: { in: [guildA, guildB] } } });
    await prisma.checkoutSession.deleteMany({ where: { guildId: { in: [guildA, guildB] } } });
    await prisma.paymentTransaction.deleteMany({ where: { guildId: { in: [guildA, guildB] } } });
    await prisma.guildEntitlement.deleteMany({ where: { guildId: { in: [guildA, guildB] } } });
    await prisma.guildSubscription.deleteMany({ where: { guildId: { in: [guildA, guildB] } } });
    await prisma.billingProviderEvent.deleteMany({
      where: { correlationId: { startsWith: 'billing-integration-' } },
    });
    await prisma.guild.deleteMany({ where: { id: { in: [guildA, guildB] } } });
    await prisma.user.deleteMany({ where: { discordId: purchaserDiscordId } });
    await prisma.billingPlan.deleteMany({
      where: {
        id: planId,
        subscriptions: { none: {} },
      },
    });
    await prisma.$disconnect();
  });

  it('prevents concurrent effective subscriptions for one guild', async () => {
    const attempts = await Promise.allSettled([
      createSubscription(guildA, 'sub_concurrent_a'),
      createSubscription(guildA, 'sub_concurrent_b'),
    ]);
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
    await expect(prisma.guildSubscription.count({ where: { guildId: guildA } })).resolves.toBe(1);
  });

  it('deduplicates provider events by provider and provider event ID', async () => {
    const event = {
      provider: 'STRIPE' as const,
      providerEventId: 'evt_billing_integration_duplicate',
      eventType: 'invoice.paid',
      environment: 'test',
      payloadHash: 'a'.repeat(64),
      signatureVerified: true,
      correlationId: 'billing-integration-event',
    };
    const attempts = await Promise.allSettled([
      prisma.billingProviderEvent.create({ data: event }),
      prisma.billingProviderEvent.create({ data: event }),
    ]);
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
  });

  it('atomically activates, keeps scheduled cancellation, and revokes one guild only', async () => {
    const subscription = await createSubscription(guildA, 'sub_lifecycle');
    const service = new SubscriptionReconciliationService(prisma, config);
    const entitlements = new EntitlementService(prisma, config);
    const periodStart = new Date('2026-07-28T00:00:00.000Z');
    const periodEnd = new Date('2026-08-28T00:00:00.000Z');

    const activated = await service.applyState({
      subscriptionId: subscription.id,
      nextStatus: 'ACTIVE',
      expectedVersion: 1,
      latestPaymentStatus: 'SUCCEEDED',
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      providerStateVersion: 'provider-v1',
      providerUpdatedAt: periodStart,
      requestId: 'billing-integration-activate',
      source: 'webhook',
      now: new Date('2026-07-28T00:01:00.000Z'),
    });
    expect(activated.version).toBe(2);
    await expect(
      entitlements.hasGuildEntitlement(
        guildA,
        PremiumEntitlement.Base,
        new Date('2026-07-29T00:00:00.000Z'),
      ),
    ).resolves.toBe(true);
    await expect(
      entitlements.hasGuildEntitlement(
        guildB,
        PremiumEntitlement.Base,
        new Date('2026-07-29T00:00:00.000Z'),
      ),
    ).resolves.toBe(false);
    await expect(
      prisma.guildEntitlement.count({
        where: { guildId: guildA, status: 'ACTIVE' },
      }),
    ).resolves.toBe(entitlementsForFeatureSet(1).length);

    await service.applyState({
      subscriptionId: subscription.id,
      nextStatus: 'CANCELLED',
      expectedVersion: 2,
      cancellationStatus: 'SCHEDULED',
      cancelAtPeriodEnd: true,
      cancelledAt: new Date('2026-07-30T00:00:00.000Z'),
      requestId: 'billing-integration-cancel',
      source: 'webhook',
      now: new Date('2026-07-30T00:00:00.000Z'),
    });
    await expect(
      entitlements.hasGuildEntitlement(
        guildA,
        PremiumEntitlement.Base,
        new Date('2026-08-01T00:00:00.000Z'),
      ),
    ).resolves.toBe(true);

    await service.applyState({
      subscriptionId: subscription.id,
      nextStatus: 'EXPIRED',
      expectedVersion: 3,
      endedAt: periodEnd,
      requestId: 'billing-integration-expire',
      source: 'worker',
      actorType: 'WORKER',
      now: new Date('2026-08-28T00:00:01.000Z'),
    });
    await expect(
      entitlements.hasGuildEntitlement(
        guildA,
        PremiumEntitlement.Base,
        new Date('2026-08-28T00:00:01.000Z'),
      ),
    ).resolves.toBe(false);
    await expect(
      prisma.billingAuditEvent.count({ where: { subscriptionId: subscription.id } }),
    ).resolves.toBe(3);
  });

  it('commits authoritative entitlement state even when post-commit cache publication fails', async () => {
    const subscription = await createSubscription(guildA, 'sub_cache_failure');
    const failingCache = {
      getOrLoad: () => Promise.reject(new Error('unused')),
      invalidate: () => Promise.resolve(),
      publish: () => Promise.reject(new Error('redis unavailable')),
    };
    const service = new SubscriptionReconciliationService(prisma, config, failingCache as never);
    const periodStart = new Date('2026-07-28T00:00:00.000Z');
    const result = await service.applyState({
      subscriptionId: subscription.id,
      nextStatus: 'ACTIVE',
      expectedVersion: 1,
      latestPaymentStatus: 'SUCCEEDED',
      currentPeriodStart: periodStart,
      currentPeriodEnd: new Date('2026-08-28T00:00:00.000Z'),
      requestId: 'billing-integration-cache-failure',
      source: 'reconciliation',
      now: periodStart,
    });
    expect(result.cacheInvalidationPublished).toBe(false);
    await expect(
      prisma.guildEntitlement.count({
        where: { subscriptionId: subscription.id, status: 'ACTIVE' },
      }),
    ).resolves.toBeGreaterThan(0);
  });

  it('revokes Premium on a version-checked staff suspension and audits the reason', async () => {
    const subscription = await createSubscription(guildA, 'sub_staff_suspension');
    const service = new SubscriptionReconciliationService(prisma, config);
    const entitlements = new EntitlementService(prisma, config);
    const periodStart = new Date('2026-07-28T00:00:00.000Z');
    const activeAt = new Date('2026-07-28T00:01:00.000Z');
    await service.applyState({
      subscriptionId: subscription.id,
      nextStatus: 'ACTIVE',
      expectedVersion: 1,
      latestPaymentStatus: 'SUCCEEDED',
      currentPeriodStart: periodStart,
      currentPeriodEnd: new Date('2026-08-28T00:00:00.000Z'),
      requestId: 'billing-integration-suspension-activate',
      source: 'webhook',
      now: activeAt,
    });
    await service.applyState({
      subscriptionId: subscription.id,
      nextStatus: 'SUSPENDED',
      expectedVersion: 2,
      requestId: 'billing-integration-suspension-admin',
      source: 'admin',
      actorType: 'STAFF',
      auditMetadata: {
        reason: 'Verified staff review requested suspension',
        action: 'staff-entitlement-suspension',
      },
      now: new Date('2026-07-28T00:02:00.000Z'),
    });

    await expect(
      entitlements.hasGuildEntitlement(
        guildA,
        PremiumEntitlement.Base,
        new Date('2026-07-28T00:03:00.000Z'),
      ),
    ).resolves.toBe(false);
    await expect(
      prisma.billingAuditEvent.findFirst({
        where: {
          subscriptionId: subscription.id,
          actorType: 'STAFF',
          requestId: 'billing-integration-suspension-admin',
        },
        select: { metadata: true },
      }),
    ).resolves.toMatchObject({
      metadata: { reason: 'Verified staff review requested suspension' },
    });
  });
});
