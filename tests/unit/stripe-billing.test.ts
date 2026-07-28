import Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StripeBillingProvider, type CreateCheckoutInput } from '@sufbot/billing';
import { loadAppConfig, type AppConfig } from '@sufbot/config';

const webhookSecret = 'whsec_unit_test_secret';
const priceId = 'price_premium_monthly';
const nowSeconds = Math.floor(Date.now() / 1_000);
const stripeResponse = <T extends object>(value: T): Stripe.Response<T> =>
  Object.assign(value, {
    lastResponse: {
      headers: {},
      requestId: 'req_unit_test',
      statusCode: 200,
    },
  });

const configuredBilling = (): AppConfig => {
  const config = structuredClone(loadAppConfig({ environment: 'test', reload: true }));
  config.billing.enabled = true;
  config.billing.providers.stripe.enabled = true;
  return config;
};

const priceFixture = (overrides: Partial<Stripe.Price> = {}): Stripe.Price =>
  ({
    id: priceId,
    object: 'price',
    active: true,
    currency: 'usd',
    livemode: false,
    type: 'recurring',
    unit_amount: 400,
    recurring: {
      interval: 'month',
      interval_count: 1,
      aggregate_usage: null,
      meter: null,
      trial_period_days: null,
      usage_type: 'licensed',
    },
    ...overrides,
  }) as Stripe.Price;

const invoiceFixture = (): Stripe.Invoice =>
  ({
    id: 'in_paid',
    object: 'invoice',
    amount_paid: 400,
    attempted: true,
    billing_reason: 'subscription_create',
    currency: 'usd',
    status: 'paid',
  }) as Stripe.Invoice;

const subscriptionFixture = (overrides: Partial<Stripe.Subscription> = {}): Stripe.Subscription =>
  ({
    id: 'sub_verified',
    object: 'subscription',
    cancel_at_period_end: false,
    canceled_at: null,
    created: nowSeconds - 60,
    customer: 'cus_verified',
    ended_at: null,
    items: {
      object: 'list',
      data: [
        {
          id: 'si_premium',
          object: 'subscription_item',
          current_period_start: nowSeconds - 60,
          current_period_end: nowSeconds + 2_592_000,
          price: priceFixture(),
        } as Stripe.SubscriptionItem,
      ],
      has_more: false,
      url: '/v1/subscription_items',
    },
    latest_invoice: invoiceFixture(),
    livemode: false,
    status: 'active',
    ...overrides,
  }) as Stripe.Subscription;

const signedEvent = (
  stripe: Stripe,
  event: Record<string, unknown>,
): { rawBody: Buffer; signature: string } => {
  const payload = JSON.stringify(event);
  return {
    rawBody: Buffer.from(payload),
    signature: stripe.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
      timestamp: nowSeconds,
    }),
  };
};

describe('Stripe billing provider', () => {
  let stripe: Stripe;
  let provider: StripeBillingProvider;

  beforeEach(() => {
    stripe = new Stripe('sk_test_unit_test', { telemetry: false });
    provider = new StripeBillingProvider({
      config: configuredBilling(),
      environment: 'test',
      secretKey: 'sk_test_unit_test',
      webhookSecret,
      priceId,
      client: stripe,
    });
  });

  it('fails readiness when the immutable Stripe Price drifts from config', async () => {
    vi.spyOn(stripe.prices, 'retrieve').mockResolvedValue(
      stripeResponse(priceFixture({ unit_amount: 500 })),
    );
    const capabilities = await provider.checkCapabilities();
    expect(capabilities.ready).toBe(false);
    expect(capabilities.reasonCodes).toContain('STRIPE_PRICE_AMOUNT_MISMATCH');
  });

  it('creates hosted subscription Checkout from the configured Price only', async () => {
    const create = vi.spyOn(stripe.checkout.sessions, 'create').mockResolvedValue(
      stripeResponse({
        id: 'cs_test_verified',
        object: 'checkout.session',
        url: 'https://checkout.stripe.com/c/pay/cs_test_verified',
        expires_at: nowSeconds + 3_600,
      } as Stripe.Checkout.Session),
    );
    const input: CreateCheckoutInput = {
      checkoutSessionId: '018f3310-1ad6-7bc2-8c69-556142421111',
      subscriptionId: '018f3310-1ad6-7bc2-8c69-556142422222',
      purchaserUserId: '018f3310-1ad6-7bc2-8c69-556142423333',
      guildId: '982000000000000010',
      plan: {
        code: 'premium_monthly',
        displayName: 'SufBot Premium',
        amountMinor: 400,
        currency: 'USD',
        interval: 'month',
        intervalCount: 1,
        featureSetVersion: 1,
      },
      successUrl: 'https://example.test/premium/confirming',
      cancelUrl: 'https://example.test/premium/cancelled',
      expiresAt: new Date((nowSeconds + 3_600) * 1_000),
      idempotencyKey: 'stripe-checkout-idempotency-key',
    };

    await expect(provider.createCheckout(input)).resolves.toMatchObject({
      providerSessionId: 'cs_test_verified',
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        client_reference_id: input.checkoutSessionId,
      }),
      { idempotencyKey: input.idempotencyKey },
    );
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty('amount');
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty('currency');
  });

  it('verifies the exact raw body and normalizes a paid invoice authoritatively', async () => {
    const subscription = subscriptionFixture();
    vi.spyOn(stripe.subscriptions, 'retrieve').mockResolvedValue(stripeResponse(subscription));
    vi.spyOn(stripe.invoicePayments, 'list').mockResolvedValue(
      stripeResponse({
        object: 'list',
        data: [
          {
            id: 'inpay_verified',
            object: 'invoice_payment',
            invoice: 'in_paid',
            payment: { type: 'payment_intent', payment_intent: 'pi_verified' },
            status: 'paid',
          } as Stripe.InvoicePayment,
        ],
        has_more: false,
        url: '/v1/invoice_payments',
      } as Stripe.ApiList<Stripe.InvoicePayment>),
    );
    const invoice = {
      ...invoiceFixture(),
      parent: {
        type: 'subscription_details',
        quote_details: null,
        subscription_details: {
          metadata: null,
          subscription: subscription.id,
        },
      },
    };
    const signed = signedEvent(stripe, {
      id: 'evt_invoice_paid',
      object: 'event',
      created: nowSeconds,
      data: { object: invoice },
      livemode: false,
      pending_webhooks: 1,
      request: null,
      type: 'invoice.paid',
    });

    await expect(
      provider.verifyAndParseWebhook({
        rawBody: signed.rawBody,
        headers: { 'stripe-signature': signed.signature },
        receivedAt: new Date(),
        correlationId: 'req_stripe_unit_paid',
      }),
    ).resolves.toMatchObject({
      type: 'subscription.activated',
      providerEventId: 'evt_invoice_paid',
      providerSubscriptionId: 'sub_verified',
      providerPaymentId: 'pi_verified',
      providerInvoiceId: 'in_paid',
      amountMinor: 400,
      currency: 'USD',
    });
  });

  it('rejects invalid signatures before interpreting event content', async () => {
    await expect(
      provider.verifyAndParseWebhook({
        rawBody: Buffer.from('{"type":"invoice.paid"}'),
        headers: { 'stripe-signature': 't=1,v1=forged' },
        receivedAt: new Date(),
        correlationId: 'req_stripe_unit_invalid',
      }),
    ).rejects.toMatchObject({ code: 'STRIPE_SIGNATURE_INVALID' });
  });

  it('uses provider-managed cancel, resume, and a restricted Billing Portal', async () => {
    const managedProvider = new StripeBillingProvider({
      config: configuredBilling(),
      environment: 'test',
      secretKey: 'sk_test_unit_test',
      webhookSecret,
      priceId,
      portalConfigurationId: 'bpc_restricted',
      client: stripe,
    });
    const update = vi
      .spyOn(stripe.subscriptions, 'update')
      .mockResolvedValueOnce(stripeResponse(subscriptionFixture({ cancel_at_period_end: true })))
      .mockResolvedValueOnce(stripeResponse(subscriptionFixture({ cancel_at_period_end: false })));
    const portal = vi.spyOn(stripe.billingPortal.sessions, 'create').mockResolvedValue(
      stripeResponse({
        id: 'bps_verified',
        object: 'billing_portal.session',
        configuration: 'bpc_restricted',
        created: nowSeconds,
        customer: 'cus_verified',
        livemode: false,
        locale: null,
        on_behalf_of: null,
        return_url: 'https://example.test/dashboard',
        url: 'https://billing.stripe.com/p/session/test',
      } as Stripe.BillingPortal.Session),
    );

    await expect(
      managedProvider.cancelSubscription({
        providerSubscriptionId: 'sub_verified',
        atPeriodEnd: true,
        idempotencyKey: 'cancel-key',
      }),
    ).resolves.toMatchObject({ cancelAtPeriodEnd: true });
    await expect(
      managedProvider.resumeSubscription({
        providerSubscriptionId: 'sub_verified',
        idempotencyKey: 'resume-key',
      }),
    ).resolves.toMatchObject({ cancelAtPeriodEnd: false });
    await expect(
      managedProvider.createManagementSession({
        providerCustomerId: 'cus_verified',
        returnUrl: 'https://example.test/dashboard',
      }),
    ).resolves.toMatchObject({
      url: 'https://billing.stripe.com/p/session/test',
    });
    expect(update).toHaveBeenNthCalledWith(
      1,
      'sub_verified',
      { cancel_at_period_end: true },
      { idempotencyKey: 'cancel-key' },
    );
    expect(update).toHaveBeenNthCalledWith(
      2,
      'sub_verified',
      { cancel_at_period_end: false },
      { idempotencyKey: 'resume-key' },
    );
    expect(portal).toHaveBeenCalledWith(
      expect.objectContaining({ configuration: 'bpc_restricted' }),
    );
  });
});
