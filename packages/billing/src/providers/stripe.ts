import Stripe from 'stripe';
import type { AppConfig } from '@sufbot/config';
import { AppError, InternalServiceError } from '@sufbot/shared';
import {
  parseNormalizedProviderEvent,
  type BillingProvider,
  type CancelSubscriptionInput,
  type CancelSubscriptionResult,
  type CreateCheckoutInput,
  type CreateManagementSessionInput,
  type CreateManagementSessionResult,
  type InternalSubscription,
  type NormalizedProviderEvent,
  type ProviderCapabilities,
  type ProviderCheckoutResult,
  type ProviderSubscriptionSnapshot,
  type RawWebhookInput,
  type ReconciliationResult,
  type ResumeSubscriptionInput,
  type ResumeSubscriptionResult,
  type SubscriptionStatus,
} from '../contracts.js';

const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;
const SUPPORTED_EVENT_TYPES = new Set<Stripe.Event.Type>([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'invoice.paid',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'invoice.payment_action_required',
  'charge.refunded',
  'charge.dispute.created',
  'charge.dispute.closed',
]);

type StripeAdapterEnvironment = 'development' | 'test' | 'production';

export type StripeAdapterOptions = {
  config: AppConfig;
  environment: StripeAdapterEnvironment;
  secretKey?: string;
  webhookSecret?: string;
  priceId?: string;
  portalConfigurationId?: string;
  client?: Stripe;
};

const providerUnavailable = (code: string, message: string, cause?: unknown): AppError =>
  new AppError({
    code,
    message,
    statusCode: 503,
    expose: true,
    ...(cause === undefined ? {} : { cause }),
  });

const objectId = (value: { id: string } | string | null | undefined): string | undefined => {
  if (typeof value === 'string') return value;
  return value?.id;
};

const fromUnixSeconds = (value: number | null | undefined): Date | undefined =>
  value === null || value === undefined ? undefined : new Date(value * 1_000);

const normalizedStatus = (status: Stripe.Subscription.Status): SubscriptionStatus => {
  switch (status) {
    case 'incomplete':
    case 'trialing':
      return 'INCOMPLETE';
    case 'active':
      return 'ACTIVE';
    case 'past_due':
      return 'PAST_DUE';
    case 'unpaid':
    case 'paused':
      return 'SUSPENDED';
    case 'canceled':
      return 'CANCELLED';
    case 'incomplete_expired':
      return 'EXPIRED';
  }
};

export class StripeBillingProvider implements BillingProvider {
  public readonly provider = 'STRIPE' as const;
  readonly #config: AppConfig;
  readonly #environment: StripeAdapterEnvironment;
  readonly #secretKey: string | undefined;
  readonly #webhookSecret: string | undefined;
  readonly #priceId: string | undefined;
  readonly #portalConfigurationId: string | undefined;
  readonly #stripe: Stripe | undefined;

  public constructor(options: StripeAdapterOptions) {
    this.#config = options.config;
    this.#environment = options.environment;
    this.#secretKey = options.secretKey;
    this.#webhookSecret = options.webhookSecret;
    this.#priceId = options.priceId;
    this.#portalConfigurationId = options.portalConfigurationId;
    this.#stripe =
      options.client ??
      (options.secretKey === undefined
        ? undefined
        : new Stripe(options.secretKey, {
            maxNetworkRetries: 2,
            timeout: 20_000,
            telemetry: false,
          }));
  }

  public async checkCapabilities(): Promise<ProviderCapabilities> {
    const enabled = this.#config.billing.providers.stripe.enabled;
    const credentialsPresent = this.#stripe !== undefined;
    const callbackConfigured = this.#webhookSecret !== undefined;
    const reasonCodes: string[] = [];
    let priceValid = false;
    let testMode = this.#secretKey?.startsWith('sk_test_') ?? this.#environment !== 'production';

    if (!enabled) reasonCodes.push('PROVIDER_DISABLED');
    if (!credentialsPresent) reasonCodes.push('STRIPE_SECRET_KEY_MISSING');
    if (!callbackConfigured) reasonCodes.push('STRIPE_WEBHOOK_SECRET_MISSING');
    if (this.#priceId === undefined) {
      reasonCodes.push('STRIPE_PRICE_ID_MISSING');
    } else if (this.#stripe !== undefined) {
      try {
        const price = await this.#stripe.prices.retrieve(this.#priceId);
        priceValid = this.#priceMatchesConfiguration(price);
        testMode = !price.livemode;
        if (!price.active) reasonCodes.push('STRIPE_PRICE_INACTIVE');
        if (price.type !== 'recurring') reasonCodes.push('STRIPE_PRICE_NOT_RECURRING');
        if (price.unit_amount !== this.#config.billing.plan.priceMinor) {
          reasonCodes.push('STRIPE_PRICE_AMOUNT_MISMATCH');
        }
        if (price.currency.toUpperCase() !== this.#config.billing.plan.currency) {
          reasonCodes.push('STRIPE_PRICE_CURRENCY_MISMATCH');
        }
        if (price.recurring?.interval !== 'month' || price.recurring.interval_count !== 1) {
          reasonCodes.push('STRIPE_PRICE_INTERVAL_MISMATCH');
        }
        if (price.livemode !== (this.#environment === 'production')) {
          reasonCodes.push('STRIPE_ENVIRONMENT_MISMATCH');
          priceValid = false;
        }
      } catch {
        reasonCodes.push('STRIPE_PRICE_RETRIEVAL_FAILED');
      }
    }

    const ready =
      enabled &&
      credentialsPresent &&
      callbackConfigured &&
      this.#priceId !== undefined &&
      priceValid;
    return {
      provider: 'STRIPE',
      configured: credentialsPresent && this.#priceId !== undefined,
      credentialsPresent,
      hostedInitialPayment: true,
      cardStorage: true,
      recurring: true,
      merchantInitiatedRenewal: false,
      supportedCurrencies: [this.#config.billing.plan.currency],
      testMode,
      callbackConfigured,
      callbackReachable: null,
      ready,
      reasonCodes,
    };
  }

  public async createCheckout(input: CreateCheckoutInput): Promise<ProviderCheckoutResult> {
    const stripe = this.#requireStripe();
    const priceId = this.#requirePriceId();
    if (input.plan.code !== this.#config.billing.plan.code) {
      throw providerUnavailable(
        'BILLING_PLAN_MISMATCH',
        'The requested plan does not match the configured billing plan.',
      );
    }
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        client_reference_id: input.checkoutSessionId,
        expires_at: Math.floor(input.expiresAt.getTime() / 1_000),
        allow_promotion_codes: false,
        billing_address_collection: 'auto',
        ...(input.providerCustomerId === undefined
          ? { customer_creation: 'always' }
          : { customer: input.providerCustomerId }),
        metadata: {
          checkout_session_id: input.checkoutSessionId,
          subscription_id: input.subscriptionId,
          guild_id: input.guildId,
          purchaser_user_id: input.purchaserUserId,
          plan_code: input.plan.code,
          environment: this.#environment,
        },
        subscription_data: {
          metadata: {
            checkout_session_id: input.checkoutSessionId,
            subscription_id: input.subscriptionId,
            guild_id: input.guildId,
            purchaser_user_id: input.purchaserUserId,
            plan_code: input.plan.code,
            environment: this.#environment,
          },
        },
      },
      { idempotencyKey: input.idempotencyKey },
    );
    if (session.url === null) {
      throw new InternalServiceError(
        'STRIPE_CHECKOUT_URL_MISSING',
        'Stripe did not return a hosted checkout URL.',
      );
    }
    return {
      kind: 'redirect',
      providerSessionId: session.id,
      url: session.url,
      expiresAt: new Date(session.expires_at * 1_000),
    };
  }

  public async cancelSubscription(
    input: CancelSubscriptionInput,
  ): Promise<CancelSubscriptionResult> {
    const subscription = await this.#requireStripe().subscriptions.update(
      input.providerSubscriptionId,
      { cancel_at_period_end: true },
      { idempotencyKey: input.idempotencyKey },
    );
    return {
      providerSubscriptionId: subscription.id,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      ...(this.#period(subscription).end === undefined
        ? {}
        : { effectiveAt: this.#period(subscription).end }),
    };
  }

  public async resumeSubscription(
    input: ResumeSubscriptionInput,
  ): Promise<ResumeSubscriptionResult> {
    const subscription = await this.#requireStripe().subscriptions.update(
      input.providerSubscriptionId,
      { cancel_at_period_end: false },
      { idempotencyKey: input.idempotencyKey },
    );
    return {
      providerSubscriptionId: subscription.id,
      cancelAtPeriodEnd: false,
    };
  }

  public async createManagementSession(
    input: CreateManagementSessionInput,
  ): Promise<CreateManagementSessionResult> {
    if (this.#portalConfigurationId === undefined) {
      throw providerUnavailable(
        'STRIPE_PORTAL_NOT_CONFIGURED',
        'Stripe Billing Portal is unavailable until a restricted portal configuration is set.',
      );
    }
    const session = await this.#requireStripe().billingPortal.sessions.create({
      customer: input.providerCustomerId,
      return_url: input.returnUrl,
      configuration: this.#portalConfigurationId,
    });
    return { url: session.url };
  }

  public async verifyAndParseWebhook(input: RawWebhookInput): Promise<NormalizedProviderEvent> {
    const stripe = this.#requireStripe();
    const signatureHeader = input.headers['stripe-signature'];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    if (signature === undefined || signature.length === 0) {
      throw new AppError({
        code: 'STRIPE_SIGNATURE_MISSING',
        message: 'Stripe signature is required.',
        statusCode: 400,
      });
    }
    if (this.#webhookSecret === undefined) {
      throw providerUnavailable(
        'STRIPE_WEBHOOK_NOT_CONFIGURED',
        'Stripe webhook verification is not configured.',
      );
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        input.rawBody,
        signature,
        this.#webhookSecret,
        STRIPE_SIGNATURE_TOLERANCE_SECONDS,
      );
    } catch (error) {
      throw new AppError({
        code: 'STRIPE_SIGNATURE_INVALID',
        message: 'Stripe signature verification failed.',
        statusCode: 400,
        cause: error,
      });
    }
    if (!SUPPORTED_EVENT_TYPES.has(event.type)) {
      throw new AppError({
        code: 'STRIPE_EVENT_UNSUPPORTED',
        message: 'Stripe event type is not supported.',
        statusCode: 400,
      });
    }
    if (event.livemode !== (this.#environment === 'production')) {
      throw new AppError({
        code: 'STRIPE_ENVIRONMENT_MISMATCH',
        message: 'Stripe event environment does not match this deployment.',
        statusCode: 400,
      });
    }

    const base = {
      provider: 'STRIPE' as const,
      providerEventId: event.id,
      environment: this.#environment,
      occurredAt: new Date(event.created * 1_000).toISOString(),
      providerStateVersion: event.id,
      correlationId: input.correlationId,
    };

    if (event.type === 'charge.refunded') {
      const charge = event.data.object as Stripe.Charge;
      const subscriptionId = await this.#subscriptionIdForCharge(charge);
      return parseNormalizedProviderEvent({
        ...base,
        type: 'subscription.refunded',
        providerSubscriptionId: subscriptionId,
        providerObjectId: charge.id,
        providerCustomerId: objectId(charge.customer),
        providerPaymentId: charge.id,
        fullRefund: charge.amount_refunded >= charge.amount,
        amountMinor: charge.amount_refunded,
        currency: charge.currency.toUpperCase(),
      });
    }
    if (event.type === 'charge.dispute.created' || event.type === 'charge.dispute.closed') {
      const dispute = event.data.object as Stripe.Dispute;
      const charge =
        typeof dispute.charge === 'string'
          ? await stripe.charges.retrieve(dispute.charge)
          : dispute.charge;
      const subscriptionId = await this.#subscriptionIdForCharge(charge);
      const resolved = event.type === 'charge.dispute.closed' && dispute.status === 'won';
      return parseNormalizedProviderEvent({
        ...base,
        type: resolved ? 'subscription.dispute_resolved' : 'subscription.disputed',
        providerSubscriptionId: subscriptionId,
        providerObjectId: dispute.id,
        providerCustomerId: objectId(charge.customer),
        providerPaymentId: charge.id,
        amountMinor: charge.amount,
        currency: charge.currency.toUpperCase(),
      });
    }

    let subscription: Stripe.Subscription;
    let providerObjectId: string | undefined;
    let internalCheckoutSessionId: string | undefined;
    let invoice: Stripe.Invoice | undefined;
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== 'subscription') {
        throw new AppError({
          code: 'STRIPE_CHECKOUT_MODE_INVALID',
          message: 'Stripe checkout event is not a subscription checkout.',
          statusCode: 400,
        });
      }
      const subscriptionId = objectId(session.subscription);
      if (subscriptionId === undefined) {
        throw new AppError({
          code: 'STRIPE_SUBSCRIPTION_REFERENCE_MISSING',
          message: 'Stripe checkout did not include a subscription reference.',
          statusCode: 400,
        });
      }
      subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['latest_invoice'],
      });
      const snapshot = this.#snapshot(subscription);
      return parseNormalizedProviderEvent({
        ...base,
        type: 'subscription.pending',
        providerSubscriptionId: subscription.id,
        providerObjectId: session.id,
        internalCheckoutSessionId: session.client_reference_id ?? undefined,
        providerCustomerId: snapshot.providerCustomerId,
      });
    } else if (event.type.startsWith('invoice.')) {
      invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = objectId(invoice.parent?.subscription_details?.subscription);
      if (subscriptionId === undefined) {
        throw new AppError({
          code: 'STRIPE_INVOICE_SUBSCRIPTION_MISSING',
          message: 'Stripe invoice is not associated with a subscription.',
          statusCode: 400,
        });
      }
      subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['latest_invoice'],
      });
      providerObjectId = invoice.id;
    } else {
      const eventSubscription = event.data.object as Stripe.Subscription;
      subscription = await stripe.subscriptions.retrieve(eventSubscription.id, {
        expand: ['latest_invoice'],
      });
      providerObjectId = subscription.id;
    }

    return this.#normalizedSubscriptionEvent({
      ...base,
      eventType: event.type,
      subscription,
      ...(providerObjectId === undefined ? {} : { providerObjectId }),
      ...(internalCheckoutSessionId === undefined ? {} : { internalCheckoutSessionId }),
      ...(invoice === undefined ? {} : { invoice }),
    });
  }

  public async retrieveSubscription(
    providerSubscriptionId: string,
  ): Promise<ProviderSubscriptionSnapshot> {
    const subscription = await this.#requireStripe().subscriptions.retrieve(
      providerSubscriptionId,
      { expand: ['latest_invoice'] },
    );
    return this.#snapshot(subscription);
  }

  public async reconcileSubscription(
    subscription: InternalSubscription,
  ): Promise<ReconciliationResult> {
    if (subscription.provider !== 'STRIPE' || subscription.providerSubscriptionId === undefined) {
      throw new AppError({
        code: 'STRIPE_SUBSCRIPTION_REFERENCE_INVALID',
        message: 'Internal subscription is not bound to Stripe.',
        statusCode: 409,
      });
    }
    return {
      snapshot: await this.retrieveSubscription(subscription.providerSubscriptionId),
      authoritative: true,
      reason: 'stripe_subscription_retrieved',
    };
  }

  #requireStripe(): Stripe {
    if (this.#stripe === undefined) {
      throw providerUnavailable(
        'STRIPE_NOT_CONFIGURED',
        'Stripe is not configured for this deployment.',
      );
    }
    return this.#stripe;
  }

  #requirePriceId(): string {
    if (this.#priceId === undefined) {
      throw providerUnavailable(
        'STRIPE_PRICE_NOT_CONFIGURED',
        'Stripe Price is not configured for this deployment.',
      );
    }
    return this.#priceId;
  }

  #priceMatchesConfiguration(price: Stripe.Price): boolean {
    return (
      price.active &&
      price.type === 'recurring' &&
      price.unit_amount === this.#config.billing.plan.priceMinor &&
      price.currency.toUpperCase() === this.#config.billing.plan.currency &&
      price.recurring?.interval === 'month' &&
      price.recurring.interval_count === 1
    );
  }

  #period(subscription: Stripe.Subscription): { start?: Date; end?: Date } {
    const items = subscription.items.data;
    if (items.length !== 1 || items[0] === undefined) {
      throw providerUnavailable(
        'STRIPE_SUBSCRIPTION_ITEM_MISMATCH',
        'Stripe subscription must contain exactly one supported plan item.',
      );
    }
    if (items[0].price.id !== this.#requirePriceId()) {
      throw providerUnavailable(
        'STRIPE_SUBSCRIPTION_PRICE_MISMATCH',
        'Stripe subscription is attached to an unsupported Price.',
      );
    }
    const start = fromUnixSeconds(items[0].current_period_start);
    const end = fromUnixSeconds(items[0].current_period_end);
    return {
      ...(start === undefined ? {} : { start }),
      ...(end === undefined ? {} : { end }),
    };
  }

  #snapshot(subscription: Stripe.Subscription): ProviderSubscriptionSnapshot {
    if (subscription.livemode !== (this.#environment === 'production')) {
      throw providerUnavailable(
        'STRIPE_ENVIRONMENT_MISMATCH',
        'Stripe subscription environment does not match this deployment.',
      );
    }
    const period = this.#period(subscription);
    const invoice =
      typeof subscription.latest_invoice === 'object' &&
      subscription.latest_invoice !== null &&
      !('deleted' in subscription.latest_invoice)
        ? subscription.latest_invoice
        : undefined;
    const latestPaymentStatus =
      invoice?.status === 'paid'
        ? 'SUCCEEDED'
        : invoice?.status === 'open' && invoice.attempted
          ? 'FAILED'
          : invoice === undefined
            ? 'UNKNOWN'
            : 'PENDING';
    const providerCustomerId = objectId(subscription.customer);
    const providerUpdatedAt =
      fromUnixSeconds(subscription.canceled_at) ??
      fromUnixSeconds(subscription.ended_at) ??
      fromUnixSeconds(subscription.created);
    return {
      provider: 'STRIPE',
      providerSubscriptionId: subscription.id,
      status: normalizedStatus(subscription.status),
      ...(period.start === undefined ? {} : { currentPeriodStart: period.start }),
      ...(period.end === undefined ? {} : { currentPeriodEnd: period.end }),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      ...(providerCustomerId === undefined ? {} : { providerCustomerId }),
      providerPriceId: this.#requirePriceId(),
      latestPaymentStatus,
      providerStateVersion: `${subscription.status}:${subscription.canceled_at ?? 0}:${
        period.end?.getTime() ?? 0
      }`,
      ...(providerUpdatedAt === undefined ? {} : { providerUpdatedAt }),
    };
  }

  async #normalizedSubscriptionEvent(input: {
    provider: 'STRIPE';
    providerEventId: string;
    environment: StripeAdapterEnvironment;
    occurredAt: string;
    providerStateVersion: string;
    correlationId: string;
    eventType: Stripe.Event.Type;
    subscription: Stripe.Subscription;
    providerObjectId?: string;
    internalCheckoutSessionId?: string;
    invoice?: Stripe.Invoice;
  }): Promise<NormalizedProviderEvent> {
    const snapshot = this.#snapshot(input.subscription);
    const base = {
      provider: input.provider,
      providerEventId: input.providerEventId,
      providerSubscriptionId: input.subscription.id,
      environment: input.environment,
      occurredAt: input.occurredAt,
      providerStateVersion: input.providerStateVersion,
      correlationId: input.correlationId,
      providerObjectId: input.providerObjectId,
      internalCheckoutSessionId: input.internalCheckoutSessionId,
      providerCustomerId: snapshot.providerCustomerId,
    };
    const periodStart = snapshot.currentPeriodStart?.toISOString();
    const periodEnd = snapshot.currentPeriodEnd?.toISOString();

    if (snapshot.cancelAtPeriodEnd && snapshot.status === 'ACTIVE' && periodEnd !== undefined) {
      return parseNormalizedProviderEvent({
        ...base,
        type: 'subscription.cancel_scheduled',
        periodEnd,
      });
    }
    if (snapshot.status === 'INCOMPLETE') {
      return parseNormalizedProviderEvent({
        ...base,
        type: 'subscription.pending',
      });
    }
    if (snapshot.status === 'ACTIVE') {
      if (
        snapshot.latestPaymentStatus !== 'SUCCEEDED' &&
        input.eventType !== 'invoice.paid' &&
        input.eventType !== 'invoice.payment_succeeded'
      ) {
        return parseNormalizedProviderEvent({
          ...base,
          type: 'subscription.pending',
        });
      }
      if (periodStart === undefined || periodEnd === undefined) {
        throw providerUnavailable(
          'STRIPE_SUBSCRIPTION_PERIOD_MISSING',
          'Stripe active subscription has no authoritative billing period.',
        );
      }
      const invoice = input.invoice;
      const providerPaymentId =
        invoice === undefined ? undefined : await this.#paymentIdForInvoice(invoice.id);
      const renewal =
        invoice?.billing_reason === 'subscription_cycle' ||
        invoice?.billing_reason === 'subscription_threshold';
      return parseNormalizedProviderEvent({
        ...base,
        type: renewal ? 'subscription.renewed' : 'subscription.activated',
        periodStart,
        periodEnd,
        ...(providerPaymentId === undefined ? {} : { providerPaymentId }),
        ...(invoice === undefined ? {} : { providerInvoiceId: invoice.id }),
        ...(invoice === undefined ? {} : { amountMinor: invoice.amount_paid }),
        ...(invoice === undefined ? {} : { currency: invoice.currency.toUpperCase() }),
      });
    }
    if (snapshot.status === 'PAST_DUE' || snapshot.status === 'SUSPENDED') {
      return parseNormalizedProviderEvent({
        ...base,
        type: 'subscription.payment_failed',
        failureCode:
          input.eventType === 'invoice.payment_action_required'
            ? 'PAYMENT_ACTION_REQUIRED'
            : 'PAYMENT_FAILED',
      });
    }
    if (snapshot.status === 'EXPIRED') {
      return parseNormalizedProviderEvent({
        ...base,
        type: 'subscription.expired',
        effectiveAt: input.occurredAt,
      });
    }
    return parseNormalizedProviderEvent({
      ...base,
      type:
        input.subscription.ended_at !== null || input.eventType === 'customer.subscription.deleted'
          ? 'subscription.expired'
          : 'subscription.cancelled',
      effectiveAt: fromUnixSeconds(input.subscription.ended_at)?.toISOString() ?? input.occurredAt,
    });
  }

  async #paymentIdForInvoice(invoiceId: string): Promise<string | undefined> {
    const payments = await this.#requireStripe().invoicePayments.list({
      invoice: invoiceId,
      status: 'paid',
      limit: 1,
    });
    const payment = payments.data[0]?.payment;
    return (
      objectId(payment?.payment_intent) ??
      objectId(payment?.charge) ??
      objectId(payment?.payment_record)
    );
  }

  async #subscriptionIdForCharge(charge: Stripe.Charge): Promise<string> {
    const stripe = this.#requireStripe();
    const paymentIntentId = objectId(charge.payment_intent);
    if (paymentIntentId === undefined) {
      throw providerUnavailable(
        'STRIPE_CHARGE_SUBSCRIPTION_UNRESOLVED',
        'Stripe charge has no PaymentIntent reference for subscription reconciliation.',
      );
    }
    const payments = await stripe.invoicePayments.list({
      payment: { type: 'payment_intent', payment_intent: paymentIntentId },
      limit: 1,
    });
    const invoiceReference = payments.data[0]?.invoice;
    const invoice =
      typeof invoiceReference === 'string'
        ? await stripe.invoices.retrieve(invoiceReference)
        : invoiceReference;
    if (invoice !== undefined && 'deleted' in invoice) {
      throw providerUnavailable(
        'STRIPE_CHARGE_SUBSCRIPTION_UNRESOLVED',
        'Stripe invoice reference has been deleted.',
      );
    }
    const subscriptionId = objectId(invoice?.parent?.subscription_details?.subscription);
    if (subscriptionId === undefined) {
      throw providerUnavailable(
        'STRIPE_CHARGE_SUBSCRIPTION_UNRESOLVED',
        'Stripe charge could not be reconciled to a subscription.',
      );
    }
    return subscriptionId;
  }
}
