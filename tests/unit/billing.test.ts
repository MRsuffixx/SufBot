import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AppConfigSchema, type AppConfig } from '@sufbot/config';
import {
  PremiumEntitlement,
  assertMinorAmount,
  canTransitionSubscription,
  createBillingIdempotencyKey,
  createCheckoutNonce,
  entitlementsForFeatureSet,
  getPlanLimit,
  minorAmountToDecimal,
  sanitizeProviderMessage,
  subscriptionGrantsPremium,
  verifyCheckoutNonce,
} from '@sufbot/billing';

const committedConfig = (): AppConfig =>
  AppConfigSchema.parse(
    JSON.parse(readFileSync(resolve(process.cwd(), 'config.json'), 'utf8')) as unknown,
  );

describe('billing foundation', () => {
  it('keeps money in positive safe minor units', () => {
    expect(assertMinorAmount(400)).toBe(400);
    expect(minorAmountToDecimal(400, 'USD')).toBe('4.00');
    expect(minorAmountToDecimal(405, 'USD')).toBe('4.05');
    expect(() => assertMinorAmount(4.5)).toThrow(/safe integer/i);
    expect(() => assertMinorAmount(0)).toThrow(/positive/i);
    expect(() => assertMinorAmount(Number.MAX_SAFE_INTEGER + 1)).toThrow(/safe integer/i);
  });

  it('rejects unsafe billing exposure and malformed provider price overrides', () => {
    const noProvider = structuredClone(committedConfig());
    noProvider.billing.enabled = true;
    expect(AppConfigSchema.safeParse(noProvider).success).toBe(false);

    const floatingPrice = structuredClone(committedConfig());
    floatingPrice.billing.plan.priceMinor = 4.25;
    expect(AppConfigSchema.safeParse(floatingPrice).success).toBe(false);

    const unpairedPaytrPrice = structuredClone(committedConfig());
    unpairedPaytrPrice.billing.providers.paytr.priceMinor = 400;
    expect(AppConfigSchema.safeParse(unpairedPaytrPrice).success).toBe(false);
  });

  it('uses a versioned feature catalogue and centralized limits', () => {
    const config = committedConfig();
    const entitlements = entitlementsForFeatureSet(1);
    expect(entitlements).toContain(PremiumEntitlement.Base);
    expect(entitlements).toContain(PremiumEntitlement.AutomodAdvanced);
    expect(new Set(entitlements).size).toBe(entitlements.length);
    expect(getPlanLimit(config, 'free', 'automodRules')).toBe(3);
    expect(getPlanLimit(config, 'premium', 'automodRules')).toBe(100);
    expect(() => entitlementsForFeatureSet(999)).toThrow(/unsupported/i);
  });

  it('enforces explicit subscription transitions', () => {
    expect(canTransitionSubscription('PENDING', 'ACTIVE')).toBe(true);
    expect(canTransitionSubscription('ACTIVE', 'PAST_DUE')).toBe(true);
    expect(canTransitionSubscription('CANCELLED', 'EXPIRED')).toBe(true);
    expect(canTransitionSubscription('ACTIVE', 'ACTIVE')).toBe(true);
    expect(canTransitionSubscription('EXPIRED', 'ACTIVE')).toBe(false);
    expect(canTransitionSubscription('REFUNDED', 'ACTIVE')).toBe(false);
  });

  it('grants only paid active/cancelled periods or a bounded grace period', () => {
    const now = new Date('2026-07-28T12:00:00.000Z');
    const future = new Date('2026-08-28T12:00:00.000Z');
    expect(
      subscriptionGrantsPremium(
        {
          status: 'ACTIVE',
          currentPeriodEnd: future,
          gracePeriodEndsAt: null,
          latestPaymentStatus: 'SUCCEEDED',
        },
        now,
      ),
    ).toEqual({ grants: true, endsAt: future });
    expect(
      subscriptionGrantsPremium(
        {
          status: 'ACTIVE',
          currentPeriodEnd: future,
          gracePeriodEndsAt: null,
          latestPaymentStatus: 'PENDING',
        },
        now,
      ).grants,
    ).toBe(false);
    expect(
      subscriptionGrantsPremium(
        {
          status: 'GRACE_PERIOD',
          currentPeriodEnd: now,
          gracePeriodEndsAt: future,
          latestPaymentStatus: 'FAILED',
        },
        now,
      ).grants,
    ).toBe(true);
    expect(
      subscriptionGrantsPremium(
        {
          status: 'DISPUTED',
          currentPeriodEnd: future,
          gracePeriodEndsAt: null,
          latestPaymentStatus: 'DISPUTED',
        },
        now,
      ).grants,
    ).toBe(false);
  });

  it('hashes checkout nonces and generates deterministic scoped idempotency keys', () => {
    const checkout = createCheckoutNonce();
    expect(checkout.nonce).not.toBe(checkout.nonceHash);
    expect(checkout.nonceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyCheckoutNonce(checkout.nonce, checkout.nonceHash)).toBe(true);
    expect(verifyCheckoutNonce(`${checkout.nonce}x`, checkout.nonceHash)).toBe(false);
    const left = createBillingIdempotencyKey(
      'STRIPE',
      'invoice.renew',
      'subscription_12345678',
      '2026-08',
    );
    const right = createBillingIdempotencyKey(
      'STRIPE',
      'invoice.renew',
      'subscription_12345678',
      '2026-08',
    );
    expect(left).toBe(right);
    expect(left).toMatch(/^[a-f0-9]{64}$/);
  });

  it('sanitizes provider failures before persistence or logs', () => {
    const sanitized = sanitizeProviderMessage(
      'declined\nsk_live_abc123\tmerchant_salt=super-secret ctoken=card-token',
    );
    expect(sanitized).not.toContain('sk_live_abc123');
    expect(sanitized).not.toContain('super-secret');
    expect(sanitized).not.toContain('card-token');
    expect(sanitized).not.toMatch(/[\n\t]/);
  });
});
