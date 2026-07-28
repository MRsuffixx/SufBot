import { describe, expect, it, vi } from 'vitest';
import { loadAppConfig, type AppConfig } from '@sufbot/config';
import {
  PaytrBillingProvider,
  createPaytrCallbackHash,
  createPaytrCheckoutToken,
  paytrMerchantOrderId,
} from '@sufbot/billing';

const checkoutSessionId = '11111111-2222-4333-8444-555555555555';
const configForPaytr = (mode: 'manual_renewal' | 'recurring'): AppConfig => {
  const base = loadAppConfig({ environment: 'test', reload: true });
  return {
    ...base,
    billing: {
      ...base.billing,
      enabled: true,
      providers: {
        stripe: { enabled: false },
        paytr: { enabled: true, mode },
      },
    },
  };
};

const provider = (
  mode: 'manual_renewal' | 'recurring' = 'manual_renewal',
  fetchImplementation?: typeof fetch,
) =>
  new PaytrBillingProvider({
    config: configForPaytr(mode),
    environment: 'test',
    merchantId: '123456',
    merchantKey: 'merchant-key-value',
    merchantSalt: 'salt-value',
    callbackUrl: 'https://api.example.com/v1/webhooks/paytr',
    iframeCapabilityEnabled: true,
    recurringCapabilityEnabled: true,
    cardStorageCapabilityEnabled: true,
    approvedCurrencies: ['USD'],
    ...(fetchImplementation === undefined ? {} : { fetchImplementation }),
  });

describe('PayTR adapter', () => {
  it('matches documented checkout and callback HMAC fixtures', () => {
    expect(
      createPaytrCheckoutToken({
        merchantId: '123456',
        merchantKey: 'merchant-key-value',
        merchantSalt: 'salt-value',
        userIp: '203.0.113.10',
        merchantOrderId: 'SFB001',
        email: 'user@example.com',
        paymentAmount: '400',
        userBasket: 'W1siU3VmQm90IFByZW1pdW0iLCI0LjAwIiwxXV0=',
        noInstallment: '1',
        maxInstallment: '0',
        currency: 'USD',
        testMode: '1',
      }),
    ).toBe('UmWjZaHfwfAJ+SxGFeV0dZjMRWxovi8aEe3fx+oTbWY=');
    expect(
      createPaytrCallbackHash({
        merchantOrderId: 'SFB001',
        merchantKey: 'merchant-key-value',
        merchantSalt: 'salt-value',
        status: 'success',
        totalAmount: '400',
      }),
    ).toBe('5DliM2BsdasctRwDePUuJ0fwv3d+t7ENx7YqqXjGeuk=');
  });

  it('creates an iFrame token request without sending merchant secrets', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get('merchant_id')).toBe('123456');
      expect(body.get('merchant_oid')).toBe(paytrMerchantOrderId(checkoutSessionId));
      expect(body.get('payment_amount')).toBe('400');
      expect(body.get('currency')).toBe('USD');
      expect(body.get('no_installment')).toBe('1');
      expect(body.has('merchant_key')).toBe(false);
      expect(body.has('merchant_salt')).toBe(false);
      return new Response(JSON.stringify({ status: 'success', token: 'iframe_token_1234567890' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const result = await provider('manual_renewal', fetchMock).createCheckout({
      checkoutSessionId,
      subscriptionId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      purchaserUserId: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
      guildId: '12345678901234567',
      plan: {
        code: 'premium_monthly',
        displayName: 'SufBot Premium',
        amountMinor: 400,
        currency: 'USD',
        interval: 'month',
        intervalCount: 1,
        featureSetVersion: 1,
      },
      successUrl: 'https://example.com/premium/status',
      cancelUrl: 'https://example.com/premium',
      expiresAt: new Date(Date.now() + 30 * 60_000),
      idempotencyKey: 'paytr-checkout-key',
      paytrCustomer: {
        userIp: '203.0.113.10',
        email: 'user@example.com',
        fullName: 'Example User',
        address: 'Example address',
        phone: '+15555550123',
      },
    });
    expect(result).toMatchObject({
      kind: 'iframe',
      providerSessionId: paytrMerchantOrderId(checkoutSessionId),
      iframeToken: 'iframe_token_1234567890',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('verifies a success callback and rejects a forged hash', async () => {
    const merchantOrderId = paytrMerchantOrderId(checkoutSessionId);
    const fields = {
      merchant_oid: merchantOrderId,
      status: 'success',
      total_amount: '400',
      test_mode: '1',
      payment_type: 'card',
      currency: 'USD',
      payment_amount: '400',
    };
    const hash = createPaytrCallbackHash({
      merchantOrderId,
      merchantKey: 'merchant-key-value',
      merchantSalt: 'salt-value',
      status: 'success',
      totalAmount: '400',
    });
    const event = await provider().verifyAndParseWebhook({
      rawBody: Buffer.from(new URLSearchParams({ ...fields, hash }).toString()),
      headers: {},
      receivedAt: new Date('2026-07-28T12:00:00.000Z'),
      correlationId: 'req_11111111111111111111111111111111',
    });
    expect(event).toMatchObject({
      type: 'subscription.activated',
      provider: 'PAYTR',
      internalCheckoutSessionId: checkoutSessionId,
      amountMinor: 400,
      currency: 'USD',
      periodStart: '2026-07-28T12:00:00.000Z',
      periodEnd: '2026-08-28T12:00:00.000Z',
    });
    await expect(
      provider().verifyAndParseWebhook({
        rawBody: Buffer.from(
          new URLSearchParams({ ...fields, hash: `${hash.slice(0, -1)}A` }).toString(),
        ),
        headers: {},
        receivedAt: new Date(),
        correlationId: 'req_22222222222222222222222222222222',
      }),
    ).rejects.toMatchObject({ code: 'PAYTR_CALLBACK_HASH_INVALID' });
  });

  it('never reports recurring ready without an implemented approved recurrence flow', async () => {
    const capabilities = await provider('recurring').checkCapabilities();
    expect(capabilities).toMatchObject({
      ready: false,
      recurring: false,
      cardStorage: false,
      merchantInitiatedRenewal: false,
    });
    expect(capabilities.reasonCodes).toContain('PAYTR_RECURRING_ADAPTER_DISABLED');
  });
});
