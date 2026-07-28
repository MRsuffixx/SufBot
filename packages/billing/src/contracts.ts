import { z } from 'zod';
import { DiscordSnowflakeSchema, RequestIdSchema } from '@sufbot/shared';

export const BillingProviderNameSchema = z.enum(['STRIPE', 'PAYTR']);
export type BillingProviderName = z.infer<typeof BillingProviderNameSchema>;

export const CurrencyCodeSchema = z.enum(['USD', 'TRY', 'EUR', 'GBP', 'RUB']);
export type CurrencyCode = z.infer<typeof CurrencyCodeSchema>;

export const SubscriptionStatusSchema = z.enum([
  'PENDING',
  'INCOMPLETE',
  'ACTIVE',
  'PAST_DUE',
  'GRACE_PERIOD',
  'SUSPENDED',
  'CANCELLED',
  'EXPIRED',
  'DISPUTED',
  'REFUNDED',
]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;

export const PlanResponseSchema = z
  .object({
    code: z.string().min(1).max(64),
    displayName: z.string().min(1).max(100),
    amountMinor: z.number().int().positive().safe(),
    currency: CurrencyCodeSchema,
    interval: z.literal('month'),
    intervalCount: z.literal(1),
    featureSetVersion: z.number().int().positive(),
  })
  .strict();
export type PlanResponse = z.infer<typeof PlanResponseSchema>;

export const CheckoutRequestSchema = z
  .object({
    provider: BillingProviderNameSchema,
    planCode: z.string().regex(/^[a-z][a-z0-9_]{2,63}$/),
    confirmationAccepted: z.literal(true),
  })
  .strict();
export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>;

export const CheckoutResponseSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('redirect'),
      checkoutSessionId: z.uuid(),
      url: z.url(),
      expiresAt: z.iso.datetime(),
      statusToken: z.string().min(32).max(128),
    })
    .strict(),
  z
    .object({
      kind: z.literal('iframe'),
      checkoutSessionId: z.uuid(),
      iframeToken: z.string().min(16).max(4096),
      expiresAt: z.iso.datetime(),
      statusToken: z.string().min(32).max(128),
    })
    .strict(),
  z
    .object({
      kind: z.literal('unavailable'),
      provider: BillingProviderNameSchema,
      code: z.string().min(1).max(100),
      message: z.string().min(1).max(300),
    })
    .strict(),
]);
export type CheckoutResponse = z.infer<typeof CheckoutResponseSchema>;

export const GuildBillingStatusSchema = z
  .object({
    guildId: DiscordSnowflakeSchema,
    subscriptionId: z.uuid().nullable(),
    version: z.number().int().positive().nullable(),
    planCode: z.string().max(64).nullable(),
    provider: BillingProviderNameSchema.nullable(),
    status: SubscriptionStatusSchema.nullable(),
    premiumActive: z.boolean(),
    currentPeriodStart: z.iso.datetime().nullable(),
    currentPeriodEnd: z.iso.datetime().nullable(),
    gracePeriodEndsAt: z.iso.datetime().nullable(),
    cancelAtPeriodEnd: z.boolean(),
    cancellationStatus: z.enum(['NONE', 'SCHEDULED', 'CANCELLED']).nullable(),
    purchaserUserId: z.uuid().nullable(),
  })
  .strict();
export type GuildBillingStatus = z.infer<typeof GuildBillingStatusSchema>;

export const PaymentHistoryItemSchema = z
  .object({
    id: z.uuid(),
    provider: BillingProviderNameSchema,
    type: z.enum([
      'INITIAL',
      'RENEWAL',
      'RETRY',
      'REFUND',
      'PARTIAL_REFUND',
      'CHARGEBACK',
      'REVERSAL',
    ]),
    status: z.enum([
      'PENDING',
      'SUCCEEDED',
      'FAILED',
      'REFUNDED',
      'PARTIALLY_REFUNDED',
      'DISPUTED',
      'REVERSED',
      'UNKNOWN',
    ]),
    amountMinor: z.number().int().positive().safe(),
    currency: CurrencyCodeSchema,
    paidAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const CancellationRequestSchema = z
  .object({
    subscriptionId: z.uuid(),
    expectedVersion: z.number().int().positive(),
    idempotencyKey: z.string().min(8).max(128),
  })
  .strict();

export const ResumeRequestSchema = CancellationRequestSchema;

export const ProviderCapabilitiesSchema = z
  .object({
    provider: BillingProviderNameSchema,
    configured: z.boolean(),
    credentialsPresent: z.boolean(),
    hostedInitialPayment: z.boolean(),
    cardStorage: z.boolean(),
    recurring: z.boolean(),
    merchantInitiatedRenewal: z.boolean(),
    supportedCurrencies: z.array(CurrencyCodeSchema),
    testMode: z.boolean(),
    callbackConfigured: z.boolean(),
    callbackReachable: z.boolean().nullable(),
    ready: z.boolean(),
    reasonCodes: z.array(z.string().min(1).max(100)),
  })
  .strict();
export type ProviderCapabilities = z.infer<typeof ProviderCapabilitiesSchema>;

const NormalizedEventBaseSchema = z.object({
  provider: BillingProviderNameSchema,
  providerEventId: z.string().min(1).max(255),
  providerSubscriptionId: z.string().min(1).max(255),
  environment: z.enum(['development', 'test', 'production']),
  occurredAt: z.iso.datetime(),
  providerStateVersion: z.string().min(1).max(128).optional(),
  providerObjectId: z.string().min(1).max(255).optional(),
  internalCheckoutSessionId: z.uuid().optional(),
  providerCustomerId: z.string().min(1).max(255).optional(),
  correlationId: RequestIdSchema,
});

const subscriptionEvent = <T extends string>(
  type: T,
  extension: Record<string, z.ZodType> = {},
) => NormalizedEventBaseSchema.extend({ type: z.literal(type), ...extension }).strict();

export const NormalizedProviderEventSchema = z.discriminatedUnion('type', [
  subscriptionEvent('subscription.pending'),
  subscriptionEvent('subscription.activated', {
    periodStart: z.iso.datetime(),
    periodEnd: z.iso.datetime(),
    providerPaymentId: z.string().min(1).max(255).optional(),
    providerInvoiceId: z.string().min(1).max(255).optional(),
    amountMinor: z.number().int().nonnegative().safe().optional(),
    currency: CurrencyCodeSchema.optional(),
  }),
  subscriptionEvent('subscription.renewed', {
    periodStart: z.iso.datetime(),
    periodEnd: z.iso.datetime(),
    providerPaymentId: z.string().min(1).max(255).optional(),
    providerInvoiceId: z.string().min(1).max(255).optional(),
    amountMinor: z.number().int().nonnegative().safe().optional(),
    currency: CurrencyCodeSchema.optional(),
  }),
  subscriptionEvent('subscription.payment_failed', {
    failureCode: z.string().min(1).max(100).optional(),
  }),
  subscriptionEvent('subscription.grace_started', {
    gracePeriodEndsAt: z.iso.datetime(),
  }),
  subscriptionEvent('subscription.cancel_scheduled', {
    periodEnd: z.iso.datetime(),
  }),
  subscriptionEvent('subscription.cancelled', {
    effectiveAt: z.iso.datetime(),
  }),
  subscriptionEvent('subscription.expired', {
    effectiveAt: z.iso.datetime(),
  }),
  subscriptionEvent('subscription.refunded', {
    providerPaymentId: z.string().min(1).max(255),
    fullRefund: z.boolean(),
    amountMinor: z.number().int().nonnegative().safe(),
    currency: CurrencyCodeSchema,
  }),
  subscriptionEvent('subscription.disputed', {
    providerPaymentId: z.string().min(1).max(255),
    amountMinor: z.number().int().nonnegative().safe(),
    currency: CurrencyCodeSchema,
  }),
  subscriptionEvent('subscription.dispute_resolved', {
    providerPaymentId: z.string().min(1).max(255),
    amountMinor: z.number().int().nonnegative().safe(),
    currency: CurrencyCodeSchema,
  }),
]);
type NormalizedProviderEventBase = {
  provider: BillingProviderName;
  providerEventId: string;
  providerSubscriptionId: string;
  environment: 'development' | 'test' | 'production';
  occurredAt: string;
  providerStateVersion?: string | undefined;
  providerObjectId?: string | undefined;
  internalCheckoutSessionId?: string | undefined;
  providerCustomerId?: string | undefined;
  correlationId: string;
};

export type NormalizedProviderEvent = NormalizedProviderEventBase &
  (
    | { type: 'subscription.pending' }
    | {
        type: 'subscription.activated' | 'subscription.renewed';
        periodStart: string;
        periodEnd: string;
        providerPaymentId?: string | undefined;
        providerInvoiceId?: string | undefined;
        amountMinor?: number | undefined;
        currency?: CurrencyCode | undefined;
      }
    | { type: 'subscription.payment_failed'; failureCode?: string | undefined }
    | { type: 'subscription.grace_started'; gracePeriodEndsAt: string }
    | { type: 'subscription.cancel_scheduled'; periodEnd: string }
    | { type: 'subscription.cancelled' | 'subscription.expired'; effectiveAt: string }
    | {
        type: 'subscription.refunded';
        providerPaymentId: string;
        fullRefund: boolean;
        amountMinor: number;
        currency: CurrencyCode;
      }
    | {
        type: 'subscription.disputed' | 'subscription.dispute_resolved';
        providerPaymentId: string;
        amountMinor: number;
        currency: CurrencyCode;
      }
  );

export const parseNormalizedProviderEvent = (
  value: unknown,
): NormalizedProviderEvent =>
  NormalizedProviderEventSchema.parse(value) as NormalizedProviderEvent;

export const BillingWorkerPayloadSchema = z.discriminatedUnion('job', [
  z
    .object({
      job: z.literal('billing.process-provider-event'),
      providerEventRecordId: z.uuid(),
      correlationId: RequestIdSchema,
    })
    .strict(),
  z
    .object({
      job: z.literal('billing.reconcile-subscription'),
      subscriptionId: z.uuid(),
      correlationId: RequestIdSchema,
      reason: z.string().min(1).max(100),
    })
    .strict(),
  z
    .object({
      job: z.literal('billing.expire-entitlement'),
      guildId: DiscordSnowflakeSchema,
      subscriptionId: z.uuid(),
      expectedAt: z.iso.datetime(),
      correlationId: RequestIdSchema,
    })
    .strict(),
]);

export type CreateCheckoutInput = {
  checkoutSessionId: string;
  subscriptionId: string;
  purchaserUserId: string;
  guildId: string;
  plan: PlanResponse;
  successUrl: string;
  cancelUrl: string;
  expiresAt: Date;
  idempotencyKey: string;
  providerCustomerId?: string;
};

export type CreateCheckoutResult = z.infer<typeof CheckoutResponseSchema>;

export type ProviderCheckoutResult =
  | {
      kind: 'redirect';
      providerSessionId: string;
      url: string;
      expiresAt: Date;
    }
  | {
      kind: 'iframe';
      providerSessionId: string;
      iframeToken: string;
      expiresAt: Date;
    };

export type RawWebhookInput = {
  rawBody: Buffer;
  headers: Readonly<Record<string, string | string[] | undefined>>;
  receivedAt: Date;
  correlationId: string;
};

export type ProviderSubscriptionSnapshot = {
  provider: BillingProviderName;
  providerSubscriptionId: string;
  status: SubscriptionStatus;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd: boolean;
  providerCustomerId?: string;
  providerPriceId?: string;
  latestPaymentStatus:
    | 'PENDING'
    | 'SUCCEEDED'
    | 'FAILED'
    | 'REFUNDED'
    | 'PARTIALLY_REFUNDED'
    | 'DISPUTED'
    | 'REVERSED'
    | 'UNKNOWN';
  providerStateVersion?: string;
  providerUpdatedAt?: Date;
};

export type InternalSubscription = {
  id: string;
  provider: BillingProviderName;
  providerSubscriptionId?: string;
  status: SubscriptionStatus;
  version: number;
};

export type CancelSubscriptionInput = {
  providerSubscriptionId: string;
  atPeriodEnd: true;
  idempotencyKey: string;
};

export type CancelSubscriptionResult = {
  providerSubscriptionId: string;
  cancelAtPeriodEnd: boolean;
  effectiveAt?: Date;
};

export type ResumeSubscriptionInput = {
  providerSubscriptionId: string;
  idempotencyKey: string;
};

export type ResumeSubscriptionResult = {
  providerSubscriptionId: string;
  cancelAtPeriodEnd: false;
};

export type CreateManagementSessionInput = {
  providerCustomerId: string;
  returnUrl: string;
};

export type CreateManagementSessionResult = {
  url: string;
  expiresAt?: Date;
};

export type ReconciliationResult = {
  snapshot: ProviderSubscriptionSnapshot;
  authoritative: boolean;
  reason: string;
};

export interface BillingProvider {
  readonly provider: BillingProviderName;
  checkCapabilities(): Promise<ProviderCapabilities>;
  createCheckout(input: CreateCheckoutInput): Promise<ProviderCheckoutResult>;
  cancelSubscription(input: CancelSubscriptionInput): Promise<CancelSubscriptionResult>;
  resumeSubscription(input: ResumeSubscriptionInput): Promise<ResumeSubscriptionResult>;
  createManagementSession?(
    input: CreateManagementSessionInput,
  ): Promise<CreateManagementSessionResult>;
  verifyAndParseWebhook(input: RawWebhookInput): Promise<NormalizedProviderEvent>;
  retrieveSubscription(providerSubscriptionId: string): Promise<ProviderSubscriptionSnapshot>;
  reconcileSubscription(subscription: InternalSubscription): Promise<ReconciliationResult>;
}
