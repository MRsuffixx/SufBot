import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { AppConfig } from '@sufbot/config';
import { AppError, ConflictError, InternalServiceError } from '@sufbot/shared';
import {
  CurrencyCodeSchema,
  parseNormalizedProviderEvent,
  type BillingProvider,
  type CancelSubscriptionInput,
  type CancelSubscriptionResult,
  type CreateCheckoutInput,
  type InternalSubscription,
  type NormalizedProviderEvent,
  type ProviderCapabilities,
  type ProviderCheckoutResult,
  type ProviderSubscriptionSnapshot,
  type RawWebhookInput,
  type ReconciliationResult,
  type ResumeSubscriptionInput,
  type ResumeSubscriptionResult,
} from '../contracts.js';
import { minorAmountToDecimal } from '../money.js';
import { sanitizeProviderMessage } from '../security.js';

const PAYTR_TOKEN_URL = 'https://www.paytr.com/odeme/api/get-token';
const MERCHANT_ORDER_PREFIX = 'SFB';

const PaytrTokenResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('success'), token: z.string().min(16).max(4096) }).passthrough(),
  z.object({ status: z.literal('failed'), reason: z.string().max(500).optional() }).passthrough(),
]);

const PaytrCallbackSchema = z
  .object({
    merchant_oid: z.string().regex(/^SFB[a-f0-9]{32}$/),
    status: z.enum(['success', 'failed']),
    total_amount: z.string().regex(/^\d{1,12}$/),
    hash: z.string().min(16).max(512),
    failed_reason_code: z.string().max(20).optional(),
    failed_reason_msg: z.string().max(500).optional(),
    test_mode: z.enum(['0', '1']).optional(),
    payment_type: z.enum(['card', 'eft']),
    currency: z.enum(['TL', 'TRY', 'USD', 'EUR', 'GBP', 'RUB']).optional(),
    payment_amount: z
      .string()
      .regex(/^\d{1,12}$/)
      .optional(),
  })
  .strict();

type PaytrEnvironment = 'development' | 'test' | 'production';

export type PaytrAdapterOptions = {
  config: AppConfig;
  environment: PaytrEnvironment;
  merchantId?: string;
  merchantKey?: string;
  merchantSalt?: string;
  callbackUrl?: string;
  iframeCapabilityEnabled?: boolean;
  recurringCapabilityEnabled?: boolean;
  cardStorageCapabilityEnabled?: boolean;
  approvedCurrencies?: ReadonlyArray<'USD' | 'TRY' | 'EUR' | 'GBP' | 'RUB'>;
  fetchImplementation?: typeof fetch;
};

export const createPaytrCheckoutToken = (input: {
  merchantId: string;
  merchantKey: string;
  merchantSalt: string;
  userIp: string;
  merchantOrderId: string;
  email: string;
  paymentAmount: string;
  userBasket: string;
  noInstallment: string;
  maxInstallment: string;
  currency: string;
  testMode: string;
}): string => {
  const material =
    input.merchantId +
    input.userIp +
    input.merchantOrderId +
    input.email +
    input.paymentAmount +
    input.userBasket +
    input.noInstallment +
    input.maxInstallment +
    input.currency +
    input.testMode +
    input.merchantSalt;
  return createHmac('sha256', input.merchantKey).update(material, 'utf8').digest('base64');
};

export const createPaytrCallbackHash = (input: {
  merchantOrderId: string;
  merchantKey: string;
  merchantSalt: string;
  status: string;
  totalAmount: string;
}): string =>
  createHmac('sha256', input.merchantKey)
    .update(
      `${input.merchantOrderId}${input.merchantSalt}${input.status}${input.totalAmount}`,
      'utf8',
    )
    .digest('base64');

const safeHashEqual = (expected: string, received: string): boolean => {
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(received, 'utf8');
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
};

export const paytrMerchantOrderId = (checkoutSessionId: string): string =>
  `${MERCHANT_ORDER_PREFIX}${z.uuid().parse(checkoutSessionId).replaceAll('-', '')}`;

export const checkoutSessionIdFromPaytrOrder = (merchantOrderId: string): string => {
  const hex = merchantOrderId.slice(MERCHANT_ORDER_PREFIX.length);
  return z
    .uuid()
    .parse(
      `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
        16,
        20,
      )}-${hex.slice(20)}`,
    );
};

const addCalendarMonth = (value: Date): Date => {
  const result = new Date(value);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + 1);
  const finalDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, finalDay));
  return result;
};

const callbackFields = (rawBody: Buffer) => {
  const parameters = new URLSearchParams(rawBody.toString('utf8'));
  const allowed = new Set([
    'merchant_oid',
    'status',
    'total_amount',
    'hash',
    'failed_reason_code',
    'failed_reason_msg',
    'test_mode',
    'payment_type',
    'currency',
    'payment_amount',
  ]);
  const record: Record<string, string> = {};
  for (const key of allowed) {
    const values = parameters.getAll(key);
    if (values.length > 1) {
      throw new AppError({
        code: 'PAYTR_CALLBACK_DUPLICATE_FIELD',
        message: 'PayTR callback contains a duplicate field.',
        statusCode: 400,
      });
    }
    if (values[0] !== undefined) record[key] = values[0];
  }
  return PaytrCallbackSchema.parse(record);
};

export class PaytrBillingProvider implements BillingProvider {
  public readonly provider = 'PAYTR' as const;
  readonly #fetch: typeof fetch;

  public constructor(private readonly options: PaytrAdapterOptions) {
    this.#fetch = options.fetchImplementation ?? fetch;
  }

  public async checkCapabilities(): Promise<ProviderCapabilities> {
    const providerConfig = this.options.config.billing.providers.paytr;
    const credentialsPresent =
      this.options.merchantId !== undefined &&
      this.options.merchantKey !== undefined &&
      this.options.merchantSalt !== undefined;
    const callbackConfigured = this.options.callbackUrl !== undefined;
    const approvedCurrencies = [...new Set(this.options.approvedCurrencies ?? [])];
    const selectedCurrency = providerConfig.currency ?? this.options.config.billing.plan.currency;
    const reasonCodes: string[] = [];
    if (!providerConfig.enabled) reasonCodes.push('PROVIDER_DISABLED');
    if (!credentialsPresent) reasonCodes.push('PAYTR_CREDENTIALS_MISSING');
    if (!callbackConfigured) reasonCodes.push('PAYTR_CALLBACK_URL_MISSING');
    if (
      callbackConfigured &&
      this.options.environment === 'production' &&
      !this.options.callbackUrl?.startsWith('https://')
    ) {
      reasonCodes.push('PAYTR_CALLBACK_HTTPS_REQUIRED');
    }
    if (this.options.iframeCapabilityEnabled !== true) {
      reasonCodes.push('PAYTR_IFRAME_CAPABILITY_UNVERIFIED');
    }
    if (!approvedCurrencies.includes(selectedCurrency)) {
      reasonCodes.push('PAYTR_CURRENCY_APPROVAL_UNVERIFIED');
    }
    if (
      providerConfig.priceMinor !== undefined &&
      (providerConfig.priceMinor !== this.options.config.billing.plan.priceMinor ||
        providerConfig.currency !== this.options.config.billing.plan.currency)
    ) {
      reasonCodes.push('PAYTR_SEPARATE_PRICE_NOT_SUPPORTED_BY_CURRENT_PLAN');
    }
    if (providerConfig.mode === 'recurring') {
      reasonCodes.push('PAYTR_RECURRING_ADAPTER_DISABLED');
      if (
        this.options.recurringCapabilityEnabled !== true ||
        this.options.cardStorageCapabilityEnabled !== true
      ) {
        reasonCodes.push('PAYTR_RECURRING_MERCHANT_CAPABILITY_UNVERIFIED');
      }
    }
    const ready =
      providerConfig.enabled &&
      providerConfig.mode === 'manual_renewal' &&
      credentialsPresent &&
      callbackConfigured &&
      (this.options.environment !== 'production' ||
        this.options.callbackUrl?.startsWith('https://') === true) &&
      this.options.iframeCapabilityEnabled === true &&
      approvedCurrencies.includes(selectedCurrency) &&
      !reasonCodes.includes('PAYTR_SEPARATE_PRICE_NOT_SUPPORTED_BY_CURRENT_PLAN');
    return {
      provider: 'PAYTR',
      configured: credentialsPresent && callbackConfigured,
      credentialsPresent,
      hostedInitialPayment: this.options.iframeCapabilityEnabled === true,
      cardStorage: false,
      recurring: false,
      merchantInitiatedRenewal: false,
      supportedCurrencies: approvedCurrencies,
      testMode: this.options.environment !== 'production',
      callbackConfigured,
      callbackReachable: null,
      ready,
      reasonCodes,
    };
  }

  public async createCheckout(input: CreateCheckoutInput): Promise<ProviderCheckoutResult> {
    const capabilities = await this.checkCapabilities();
    if (!capabilities.ready) {
      throw new AppError({
        code: capabilities.reasonCodes[0] ?? 'PAYTR_UNAVAILABLE',
        message: 'PayTR is not ready for a compliant monthly payment.',
        statusCode: 503,
      });
    }
    if (input.paytrCustomer === undefined) {
      throw new AppError({
        code: 'PAYTR_BILLING_CONTACT_REQUIRED',
        message: 'PayTR requires billing contact information.',
        statusCode: 400,
      });
    }
    const merchantId = this.#credential(this.options.merchantId, 'PAYTR_MERCHANT_ID_MISSING');
    const merchantKey = this.#credential(this.options.merchantKey, 'PAYTR_MERCHANT_KEY_MISSING');
    const merchantSalt = this.#credential(this.options.merchantSalt, 'PAYTR_MERCHANT_SALT_MISSING');
    const merchantOrderId = paytrMerchantOrderId(input.checkoutSessionId);
    const paymentAmount = String(input.plan.amountMinor);
    const currency = input.plan.currency;
    const userBasket = Buffer.from(
      JSON.stringify([
        [input.plan.displayName, minorAmountToDecimal(input.plan.amountMinor, currency), 1],
      ]),
      'utf8',
    ).toString('base64');
    const noInstallment = '1';
    const maxInstallment = '0';
    const testMode = this.options.environment === 'production' ? '0' : '1';
    const paytrToken = createPaytrCheckoutToken({
      merchantId,
      merchantKey,
      merchantSalt,
      userIp: input.paytrCustomer.userIp,
      merchantOrderId,
      email: input.paytrCustomer.email,
      paymentAmount,
      userBasket,
      noInstallment,
      maxInstallment,
      currency,
      testMode,
    });
    const form = new URLSearchParams({
      merchant_id: merchantId,
      user_ip: input.paytrCustomer.userIp,
      merchant_oid: merchantOrderId,
      email: input.paytrCustomer.email,
      payment_amount: paymentAmount,
      paytr_token: paytrToken,
      user_basket: userBasket,
      debug_on: this.options.environment === 'production' ? '0' : '1',
      no_installment: noInstallment,
      max_installment: maxInstallment,
      user_name: input.paytrCustomer.fullName,
      user_address: input.paytrCustomer.address,
      user_phone: input.paytrCustomer.phone,
      merchant_ok_url: input.successUrl,
      merchant_fail_url: input.cancelUrl,
      timeout_limit: String(
        Math.max(30, Math.min(60, Math.ceil((input.expiresAt.getTime() - Date.now()) / 60_000))),
      ),
      currency,
      test_mode: testMode,
      lang: 'en',
    });
    let response: Response;
    try {
      response = await this.#fetch(PAYTR_TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      throw new InternalServiceError(
        'PAYTR_TOKEN_REQUEST_FAILED',
        'PayTR token request failed.',
        error,
      );
    }
    if (!response.ok) {
      throw new InternalServiceError(
        'PAYTR_TOKEN_HTTP_ERROR',
        'PayTR token endpoint returned an error.',
      );
    }
    let payload: z.infer<typeof PaytrTokenResponseSchema>;
    try {
      payload = PaytrTokenResponseSchema.parse(await response.json());
    } catch (error) {
      throw new InternalServiceError(
        'PAYTR_TOKEN_RESPONSE_INVALID',
        'PayTR token response was invalid.',
        error,
      );
    }
    if (payload.status !== 'success') {
      throw new AppError({
        code: 'PAYTR_TOKEN_REJECTED',
        message: sanitizeProviderMessage(payload.reason ?? 'PayTR rejected the token request.'),
        statusCode: 503,
        expose: false,
      });
    }
    return {
      kind: 'iframe',
      providerSessionId: merchantOrderId,
      iframeToken: payload.token,
      expiresAt: input.expiresAt,
    };
  }

  public async verifyAndParseWebhook(input: RawWebhookInput): Promise<NormalizedProviderEvent> {
    const merchantKey = this.#credential(this.options.merchantKey, 'PAYTR_MERCHANT_KEY_MISSING');
    const merchantSalt = this.#credential(this.options.merchantSalt, 'PAYTR_MERCHANT_SALT_MISSING');
    const callback = callbackFields(input.rawBody);
    const expectedHash = createPaytrCallbackHash({
      merchantOrderId: callback.merchant_oid,
      merchantKey,
      merchantSalt,
      status: callback.status,
      totalAmount: callback.total_amount,
    });
    if (!safeHashEqual(expectedHash, callback.hash)) {
      throw new AppError({
        code: 'PAYTR_CALLBACK_HASH_INVALID',
        message: 'PayTR callback hash verification failed.',
        statusCode: 400,
      });
    }
    const callbackIsTest = callback.test_mode === '1';
    if (
      (this.options.environment === 'production' && callbackIsTest) ||
      (this.options.environment !== 'production' && !callbackIsTest)
    ) {
      throw new AppError({
        code: 'PAYTR_ENVIRONMENT_MISMATCH',
        message: 'PayTR callback environment does not match this deployment.',
        statusCode: 400,
      });
    }
    const internalCheckoutSessionId = checkoutSessionIdFromPaytrOrder(callback.merchant_oid);
    const base = {
      provider: 'PAYTR' as const,
      providerEventId: `paytr:${callback.merchant_oid}`,
      providerSubscriptionId: callback.merchant_oid,
      environment: this.options.environment,
      occurredAt: input.receivedAt.toISOString(),
      providerStateVersion: `${callback.status}:${callback.total_amount}`,
      providerObjectId: callback.merchant_oid,
      internalCheckoutSessionId,
      correlationId: input.correlationId,
    };
    if (callback.status === 'failed') {
      return parseNormalizedProviderEvent({
        ...base,
        type: 'subscription.payment_failed',
        failureCode: callback.failed_reason_code ?? 'PAYTR_PAYMENT_FAILED',
      });
    }
    if (callback.currency === undefined || callback.payment_amount === undefined) {
      throw new ConflictError('PayTR success callback is missing amount or currency.');
    }
    const paymentAmount = Number(callback.payment_amount);
    const totalAmount = Number(callback.total_amount);
    if (
      !Number.isSafeInteger(paymentAmount) ||
      paymentAmount <= 0 ||
      totalAmount !== paymentAmount
    ) {
      throw new ConflictError('PayTR callback amount validation failed.');
    }
    const currency = CurrencyCodeSchema.parse(
      callback.currency === 'TL' ? 'TRY' : callback.currency,
    );
    return parseNormalizedProviderEvent({
      ...base,
      type: 'subscription.activated',
      periodStart: input.receivedAt.toISOString(),
      periodEnd: addCalendarMonth(input.receivedAt).toISOString(),
      providerPaymentId: callback.merchant_oid,
      amountMinor: paymentAmount,
      currency,
    });
  }

  public async cancelSubscription(
    _input: CancelSubscriptionInput,
  ): Promise<CancelSubscriptionResult> {
    throw new ConflictError(
      'PayTR automatic recurrence is disabled; there is no future automatic renewal to cancel.',
    );
  }

  public async resumeSubscription(
    _input: ResumeSubscriptionInput,
  ): Promise<ResumeSubscriptionResult> {
    throw new ConflictError('PayTR recurring renewal is unavailable.');
  }

  public async retrieveSubscription(
    _providerSubscriptionId: string,
  ): Promise<ProviderSubscriptionSnapshot> {
    throw new ConflictError(
      'PayTR manual-renewal payments do not expose a provider subscription object.',
    );
  }

  public async reconcileSubscription(
    _subscription: InternalSubscription,
  ): Promise<ReconciliationResult> {
    throw new ConflictError(
      'PayTR manual renewal must be reconciled against its payment order, not a fabricated subscription.',
    );
  }

  #credential(value: string | undefined, code: string): string {
    if (value === undefined) {
      throw new AppError({
        code,
        message: 'PayTR is not configured.',
        statusCode: 503,
        expose: false,
      });
    }
    return value;
  }
}
