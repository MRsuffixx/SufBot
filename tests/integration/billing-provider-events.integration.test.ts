import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BillingProviderEventService,
  EntitlementService,
  PremiumEntitlement,
  type BillingProvider,
  type NormalizedProviderEvent,
} from '@sufbot/billing';
import { loadAppConfig } from '@sufbot/config';
import { createPrismaClient, type PrismaClient } from '@sufbot/database';

const databaseUrl = process.env.TEST_DATABASE_URL;
const run = databaseUrl === undefined ? describe.skip : describe;

class FixtureProvider {
  public readonly provider = 'STRIPE' as const;
  public readonly events = new Map<string, NormalizedProviderEvent>();

  public verifyAndParseWebhook(input: { rawBody: Buffer }) {
    const event = this.events.get(input.rawBody.toString('utf8'));
    if (event === undefined) throw new Error('Unknown fixture event');
    return Promise.resolve(event);
  }
}

run('verified provider event lifecycle', () => {
  let prisma: PrismaClient;
  let service: BillingProviderEventService;
  let entitlementService: EntitlementService;
  let subscriptionId: string;
  let checkoutSessionId: string;
  let userId: string;
  const provider = new FixtureProvider();
  const config = loadAppConfig({ environment: 'test', reload: true });
  const discordUserId = '983000000000000001';
  const guildId = '983000000000000010';
  const providerSubscriptionId = 'sub_provider_event_lifecycle';
  const providerSessionId = 'cs_provider_event_lifecycle';
  const periodStart = new Date('2026-07-28T10:00:00.000Z');
  const periodEnd = new Date('2026-08-28T10:00:00.000Z');

  const event = (
    providerEventId: string,
    value: Omit<
      NormalizedProviderEvent,
      | 'provider'
      | 'providerEventId'
      | 'providerSubscriptionId'
      | 'environment'
      | 'correlationId'
    >,
  ): NormalizedProviderEvent =>
    ({
      provider: 'STRIPE',
      providerEventId,
      providerSubscriptionId,
      environment: 'test',
      correlationId: `req_${providerEventId}`,
      ...value,
    }) as NormalizedProviderEvent;

  const ingest = (providerEventId: string) =>
    service.ingestWebhook('STRIPE', {
      rawBody: Buffer.from(providerEventId),
      headers: {},
      receivedAt: new Date(),
      correlationId: `req_${providerEventId}`,
    });

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl as string);
    const user = await prisma.user.upsert({
      where: { discordId: discordUserId },
      create: { discordId: discordUserId, displayName: 'Provider event purchaser' },
      update: { deletedAt: null },
    });
    userId = user.id;
    await prisma.guild.create({
      data: {
        id: guildId,
        name: 'Provider Event Guild',
        ownerDiscordId: discordUserId,
        botInstalled: true,
      },
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
        active: true,
        amountMinor: config.billing.plan.priceMinor,
        currency: config.billing.plan.currency,
      },
    });
    const subscription = await prisma.guildSubscription.create({
      data: {
        guildId,
        purchaserUserId: userId,
        billingPlanId: plan.id,
        planCode: plan.code,
        planDisplayNameSnapshot: plan.displayName,
        amountMinorSnapshot: plan.amountMinor,
        currencySnapshot: plan.currency,
        featureSetVersion: plan.featureSetVersion,
        provider: 'STRIPE',
      },
    });
    subscriptionId = subscription.id;
    const checkout = await prisma.checkoutSession.create({
      data: {
        userId,
        guildId,
        subscriptionId,
        provider: 'STRIPE',
        planCode: plan.code,
        environment: 'test',
        nonceHash: 'a'.repeat(64),
        expiresAt: new Date('2026-08-01T00:00:00.000Z'),
        providerSessionId,
        state: 'PROVIDER_PENDING',
        amountMinorSnapshot: plan.amountMinor,
        currencySnapshot: plan.currency,
      },
    });
    checkoutSessionId = checkout.id;
    const providers = new Map([
      ['STRIPE' as const, provider as unknown as BillingProvider],
    ]);
    service = new BillingProviderEventService(prisma, config, providers);
    entitlementService = new EntitlementService(prisma, config);
  });

  afterAll(async () => {
    await prisma.billingAuditEvent.deleteMany({ where: { guildId } });
    await prisma.checkoutSession.deleteMany({ where: { guildId } });
    await prisma.paymentTransaction.deleteMany({ where: { guildId } });
    await prisma.guildEntitlement.deleteMany({ where: { guildId } });
    await prisma.guildSubscription.deleteMany({ where: { guildId } });
    await prisma.billingProviderEvent.deleteMany({
      where: { correlationId: { startsWith: 'req_evt_provider_' } },
    });
    await prisma.billingCustomer.deleteMany({ where: { userId } });
    await prisma.guild.delete({ where: { id: guildId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.billingPlan.deleteMany({
      where: { code: config.billing.plan.code, subscriptions: { none: {} } },
    });
    await prisma.$disconnect();
  });

  it('binds checkout without granting, activates on paid invoice, and deduplicates replay', async () => {
    const pending = event('evt_provider_pending', {
      type: 'subscription.pending',
      occurredAt: '2026-07-28T10:00:01.000Z',
      providerStateVersion: 'evt_provider_pending',
      providerObjectId: providerSessionId,
      internalCheckoutSessionId: checkoutSessionId,
      providerCustomerId: 'cus_provider_event',
    });
    provider.events.set(pending.providerEventId, pending);
    await expect(ingest(pending.providerEventId)).resolves.toMatchObject({
      processed: true,
      duplicate: false,
    });
    await expect(
      entitlementService.hasGuildEntitlement(
        guildId,
        PremiumEntitlement.Base,
        new Date('2026-07-28T10:00:02.000Z'),
      ),
    ).resolves.toBe(false);

    const activated = event('evt_provider_activated', {
      type: 'subscription.activated',
      occurredAt: '2026-07-28T10:00:03.000Z',
      providerStateVersion: 'evt_provider_activated',
      providerObjectId: 'in_provider_initial',
      providerCustomerId: 'cus_provider_event',
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      providerPaymentId: 'pi_provider_initial',
      providerInvoiceId: 'in_provider_initial',
      amountMinor: 400,
      currency: 'USD',
    });
    provider.events.set(activated.providerEventId, activated);
    await expect(ingest(activated.providerEventId)).resolves.toMatchObject({
      processed: true,
    });
    await expect(
      entitlementService.hasGuildEntitlement(
        guildId,
        PremiumEntitlement.Base,
        new Date('2026-07-29T00:00:00.000Z'),
      ),
    ).resolves.toBe(true);
    await expect(
      prisma.checkoutSession.findUniqueOrThrow({
        where: { id: checkoutSessionId },
        select: { state: true },
      }),
    ).resolves.toMatchObject({ state: 'COMPLETED' });

    await expect(ingest(activated.providerEventId)).resolves.toMatchObject({
      processed: true,
      duplicate: true,
    });
    await expect(
      prisma.paymentTransaction.count({
        where: { subscriptionId, providerInvoiceId: 'in_provider_initial' },
      }),
    ).resolves.toBe(1);
  });

  it('renews, keeps entitlement through scheduled cancellation, and revokes at expiration', async () => {
    const renewedEnd = new Date('2026-09-28T10:00:00.000Z');
    const renewed = event('evt_provider_renewed', {
      type: 'subscription.renewed',
      occurredAt: '2026-08-28T10:00:01.000Z',
      providerStateVersion: 'evt_provider_renewed',
      periodStart: periodEnd.toISOString(),
      periodEnd: renewedEnd.toISOString(),
      providerPaymentId: 'pi_provider_renewal',
      providerInvoiceId: 'in_provider_renewal',
      amountMinor: 400,
      currency: 'USD',
    });
    provider.events.set(renewed.providerEventId, renewed);
    await expect(ingest(renewed.providerEventId)).resolves.toMatchObject({
      processed: true,
    });

    const scheduled = event('evt_provider_cancel_scheduled', {
      type: 'subscription.cancel_scheduled',
      occurredAt: '2026-08-30T10:00:00.000Z',
      providerStateVersion: 'evt_provider_cancel_scheduled',
      periodEnd: renewedEnd.toISOString(),
    });
    provider.events.set(scheduled.providerEventId, scheduled);
    await ingest(scheduled.providerEventId);
    await expect(
      entitlementService.hasGuildEntitlement(
        guildId,
        PremiumEntitlement.Base,
        new Date('2026-09-01T00:00:00.000Z'),
      ),
    ).resolves.toBe(true);

    const expired = event('evt_provider_expired', {
      type: 'subscription.expired',
      occurredAt: '2026-09-28T10:00:01.000Z',
      providerStateVersion: 'evt_provider_expired',
      effectiveAt: '2026-09-28T10:00:00.000Z',
    });
    provider.events.set(expired.providerEventId, expired);
    await ingest(expired.providerEventId);
    await expect(
      entitlementService.hasGuildEntitlement(
        guildId,
        PremiumEntitlement.Base,
        new Date('2026-09-28T10:00:01.000Z'),
      ),
    ).resolves.toBe(false);
  });

  it('rejects amount drift without changing entitlement state', async () => {
    const versionBefore = await prisma.guildSubscription.findUniqueOrThrow({
      where: { id: subscriptionId },
      select: { version: true, status: true },
    });
    const mismatch = event('evt_provider_amount_mismatch', {
      type: 'subscription.renewed',
      occurredAt: '2026-10-28T10:00:00.000Z',
      providerStateVersion: 'evt_provider_amount_mismatch',
      periodStart: '2026-09-28T10:00:00.000Z',
      periodEnd: '2026-10-28T10:00:00.000Z',
      providerPaymentId: 'pi_provider_mismatch',
      providerInvoiceId: 'in_provider_mismatch',
      amountMinor: 500,
      currency: 'USD',
    });
    provider.events.set(mismatch.providerEventId, mismatch);
    await expect(ingest(mismatch.providerEventId)).rejects.toThrow(
      /amount or currency/i,
    );
    await expect(
      prisma.guildSubscription.findUniqueOrThrow({
        where: { id: subscriptionId },
        select: { version: true, status: true },
      }),
    ).resolves.toEqual(versionBefore);
    await expect(
      prisma.billingProviderEvent.findUniqueOrThrow({
        where: {
          provider_providerEventId: {
            provider: 'STRIPE',
            providerEventId: mismatch.providerEventId,
          },
        },
        select: { processingStatus: true },
      }),
    ).resolves.toMatchObject({ processingStatus: 'FAILED' });
  });
});
