import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BillingProviderEventService,
  EntitlementService,
  PaytrBillingProvider,
  PremiumEntitlement,
  createPaytrCallbackHash,
  paytrMerchantOrderId,
  type BillingProvider,
} from '@sufbot/billing';
import { loadAppConfig } from '@sufbot/config';
import { createPrismaClient, type PrismaClient } from '@sufbot/database';
import { getSafeLocalTestDatabaseUrl } from './environment.js';

const databaseUrl = getSafeLocalTestDatabaseUrl();
const run = databaseUrl === undefined ? describe.skip : describe;

run('PayTR verified callback lifecycle', () => {
  let prisma: PrismaClient;
  let service: BillingProviderEventService;
  let entitlementService: EntitlementService;
  let userId: string;
  let subscriptionId: string;
  let checkoutSessionId: string;
  const guildId = '984000000000000010';
  const discordUserId = '984000000000000001';
  const merchantKey = 'merchant-key-value';
  const merchantSalt = 'salt-value';
  const config = structuredClone(loadAppConfig({ environment: 'test', reload: true }));

  beforeAll(async () => {
    config.billing.enabled = true;
    config.billing.providers.stripe.enabled = false;
    config.billing.providers.paytr = { enabled: true, mode: 'manual_renewal' };
    prisma = createPrismaClient(databaseUrl as string);
    const user = await prisma.user.create({
      data: { discordId: discordUserId, displayName: 'PayTR callback purchaser' },
    });
    userId = user.id;
    await prisma.guild.create({
      data: {
        id: guildId,
        name: 'PayTR Callback Guild',
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
      update: {},
    });
    const subscription = await prisma.guildSubscription.create({
      data: {
        guildId,
        purchaserUserId: user.id,
        billingPlanId: plan.id,
        planCode: plan.code,
        planDisplayNameSnapshot: plan.displayName,
        amountMinorSnapshot: plan.amountMinor,
        currencySnapshot: plan.currency,
        featureSetVersion: plan.featureSetVersion,
        provider: 'PAYTR',
      },
    });
    subscriptionId = subscription.id;
    const checkout = await prisma.checkoutSession.create({
      data: {
        userId: user.id,
        guildId,
        subscriptionId,
        provider: 'PAYTR',
        planCode: plan.code,
        environment: 'test',
        nonceHash: 'c'.repeat(64),
        expiresAt: new Date('2026-07-29T00:00:00.000Z'),
        state: 'PROVIDER_PENDING',
        amountMinorSnapshot: plan.amountMinor,
        currencySnapshot: plan.currency,
      },
    });
    checkoutSessionId = checkout.id;
    const merchantOrderId = paytrMerchantOrderId(checkout.id);
    await prisma.checkoutSession.update({
      where: { id: checkout.id },
      data: { providerSessionId: merchantOrderId },
    });
    const provider = new PaytrBillingProvider({
      config,
      environment: 'test',
      merchantId: '123456',
      merchantKey,
      merchantSalt,
      callbackUrl: 'https://api.example.test/v1/webhooks/paytr',
    });
    service = new BillingProviderEventService(
      prisma,
      config,
      new Map([['PAYTR', provider as BillingProvider]]),
    );
    entitlementService = new EntitlementService(prisma, config);
  });

  afterAll(async () => {
    await prisma.billingAuditEvent.deleteMany({ where: { guildId } });
    await prisma.checkoutSession.deleteMany({ where: { guildId } });
    await prisma.paymentTransaction.deleteMany({ where: { guildId } });
    await prisma.guildEntitlement.deleteMany({ where: { guildId } });
    await prisma.guildSubscription.deleteMany({ where: { guildId } });
    await prisma.billingProviderEvent.deleteMany({
      where: { providerEventId: { startsWith: 'paytr:SFB' } },
    });
    await prisma.guild.delete({ where: { id: guildId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.billingPlan.deleteMany({
      where: { code: config.billing.plan.code, subscriptions: { none: {} } },
    });
    await prisma.$disconnect();
  });

  it('activates only from a valid callback and deduplicates the repeated callback', async () => {
    const merchantOrderId = paytrMerchantOrderId(checkoutSessionId);
    const hash = createPaytrCallbackHash({
      merchantOrderId,
      merchantKey,
      merchantSalt,
      status: 'success',
      totalAmount: '400',
    });
    const rawBody = Buffer.from(
      new URLSearchParams({
        merchant_oid: merchantOrderId,
        status: 'success',
        total_amount: '400',
        hash,
        test_mode: '1',
        payment_type: 'card',
        currency: 'USD',
        payment_amount: '400',
      }).toString(),
    );
    const input = {
      rawBody,
      headers: {},
      receivedAt: new Date('2026-07-28T12:00:00.000Z'),
      correlationId: 'req_paytr_callback_verified',
    };
    await expect(service.ingestWebhook('PAYTR', input)).resolves.toMatchObject({
      processed: true,
      duplicate: false,
      subscriptionId,
    });
    await expect(service.ingestWebhook('PAYTR', input)).resolves.toMatchObject({
      processed: true,
      duplicate: true,
    });
    await expect(
      entitlementService.hasGuildEntitlement(
        guildId,
        PremiumEntitlement.Base,
        new Date('2026-07-29T00:00:00.000Z'),
      ),
    ).resolves.toBe(true);
    await expect(prisma.paymentTransaction.count({ where: { subscriptionId } })).resolves.toBe(1);
  });
});
