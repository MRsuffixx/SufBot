import type { AppConfig } from '@sufbot/config';
import type { PrismaClient } from '@sufbot/database/generated';
import { AppError, ConflictError, NotFoundError } from '@sufbot/shared';
import {
  CheckoutResponseSchema,
  type BillingProvider,
  type BillingProviderName,
  type CheckoutResponse,
} from './contracts.js';
import { assertPersistedPlanMatchesConfig, configuredPlan } from './plan.js';
import {
  createBillingIdempotencyKey,
  createCheckoutNonce,
  sanitizeProviderMessage,
  verifyCheckoutNonce,
} from './security.js';

type ProviderRegistry = ReadonlyMap<BillingProviderName, BillingProvider>;

export type CreateGuildCheckoutInput = {
  userId: string;
  guildId: string;
  provider: BillingProviderName;
  planCode: string;
  successUrl: string;
  cancelUrl: string;
  requestId: string;
  paytrCustomer?: {
    userIp: string;
    email: string;
    fullName: string;
    address: string;
    phone: string;
  };
  now?: Date;
};

const isUniqueConstraintError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'P2002';

export class BillingCheckoutService {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly config: AppConfig,
    private readonly providers: ProviderRegistry,
    private readonly environment: 'development' | 'test' | 'production',
  ) {}

  public async createCheckout(
    input: CreateGuildCheckoutInput,
  ): Promise<CheckoutResponse> {
    if (!this.config.billing.enabled) {
      return {
        kind: 'unavailable',
        provider: input.provider,
        code: 'BILLING_DISABLED',
        message: 'Billing is not enabled for this deployment.',
      };
    }
    const plan = configuredPlan(this.config);
    if (input.planCode !== plan.code) {
      throw new AppError({
        code: 'BILLING_PLAN_INVALID',
        message: 'The requested billing plan is not available.',
        statusCode: 400,
      });
    }
    const provider = this.providers.get(input.provider);
    if (provider === undefined || !this.#providerEnabled(input.provider)) {
      return {
        kind: 'unavailable',
        provider: input.provider,
        code: 'BILLING_PROVIDER_DISABLED',
        message: 'The selected billing provider is not enabled.',
      };
    }
    const capabilities = await provider.checkCapabilities();
    if (!capabilities.ready) {
      return {
        kind: 'unavailable',
        provider: input.provider,
        code: capabilities.reasonCodes[0] ?? 'BILLING_PROVIDER_UNAVAILABLE',
        message: 'The selected billing provider is not ready for recurring billing.',
      };
    }

    await assertPersistedPlanMatchesConfig(this.prisma, this.config);
    const [guild, user, billingPlan, existing] = await Promise.all([
      this.prisma.guild.findUnique({
        where: { id: input.guildId },
        select: { botInstalled: true, leftAt: true },
      }),
      this.prisma.user.findUnique({
        where: { id: input.userId },
        select: { id: true, deletedAt: true },
      }),
      this.prisma.billingPlan.findUnique({ where: { code: plan.code } }),
      this.prisma.guildSubscription.findFirst({
        where: {
          guildId: input.guildId,
          status: {
            in: [
              'PENDING',
              'INCOMPLETE',
              'ACTIVE',
              'PAST_DUE',
              'GRACE_PERIOD',
              'SUSPENDED',
              'CANCELLED',
              'DISPUTED',
            ],
          },
        },
        select: { id: true },
      }),
    ]);
    if (guild === null || !guild.botInstalled || guild.leftAt !== null) {
      throw new NotFoundError('Installed guild');
    }
    if (user === null || user.deletedAt !== null) throw new NotFoundError('Purchaser');
    if (billingPlan === null) throw new NotFoundError('Configured billing plan');
    if (existing !== null) {
      throw new ConflictError('This guild already has an effective Premium subscription.');
    }

    const now = input.now ?? new Date();
    const expiresAt = new Date(
      now.getTime() + this.config.billing.checkoutSessionTtlMinutes * 60_000,
    );
    const checkoutNonce = createCheckoutNonce();
    let records: { checkoutSessionId: string; subscriptionId: string };
    try {
      records = await this.prisma.$transaction(async (transaction) => {
        const subscription = await transaction.guildSubscription.create({
          data: {
            guildId: input.guildId,
            purchaserUserId: input.userId,
            billingPlanId: billingPlan.id,
            planCode: plan.code,
            planDisplayNameSnapshot: plan.displayName,
            amountMinorSnapshot: plan.amountMinor,
            currencySnapshot: plan.currency,
            featureSetVersion: plan.featureSetVersion,
            provider: input.provider,
          },
        });
        const checkout = await transaction.checkoutSession.create({
          data: {
            userId: input.userId,
            guildId: input.guildId,
            subscriptionId: subscription.id,
            provider: input.provider,
            planCode: plan.code,
            environment: this.environment,
            nonceHash: checkoutNonce.nonceHash,
            expiresAt,
            amountMinorSnapshot: plan.amountMinor,
            currencySnapshot: plan.currency,
          },
        });
        await transaction.billingAuditEvent.create({
          data: {
            actorType: 'USER',
            actorUserId: input.userId,
            guildId: input.guildId,
            subscriptionId: subscription.id,
            action: 'billing.checkout.created',
            newValue: {
              checkoutSessionId: checkout.id,
              provider: input.provider,
              planCode: plan.code,
              amountMinor: plan.amountMinor,
              currency: plan.currency,
              expiresAt,
            },
            requestId: input.requestId,
            source: 'dashboard',
          },
        });
        return {
          checkoutSessionId: checkout.id,
          subscriptionId: subscription.id,
        };
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictError(
          'Another checkout or effective subscription already exists for this guild.',
        );
      }
      throw error;
    }

    try {
      const existingCustomer = await this.prisma.billingCustomer.findUnique({
        where: {
          userId_provider: { userId: input.userId, provider: input.provider },
        },
        select: { providerCustomerId: true, status: true },
      });
      const result = await provider.createCheckout({
        checkoutSessionId: records.checkoutSessionId,
        subscriptionId: records.subscriptionId,
        purchaserUserId: input.userId,
        guildId: input.guildId,
        plan,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        expiresAt,
        idempotencyKey: createBillingIdempotencyKey(
          input.provider,
          'checkout.create',
          records.checkoutSessionId,
        ),
        ...(existingCustomer?.status === 'ACTIVE'
          ? { providerCustomerId: existingCustomer.providerCustomerId }
          : {}),
        ...(input.paytrCustomer === undefined
          ? {}
          : { paytrCustomer: input.paytrCustomer }),
      });
      await this.prisma.checkoutSession.update({
        where: { id: records.checkoutSessionId },
        data: {
          state: 'PROVIDER_PENDING',
          providerSessionId: result.providerSessionId,
          expiresAt: result.expiresAt,
          version: { increment: 1 },
        },
      });
      return CheckoutResponseSchema.parse(
        result.kind === 'redirect'
          ? {
              kind: 'redirect',
              checkoutSessionId: records.checkoutSessionId,
              url: result.url,
              expiresAt: result.expiresAt.toISOString(),
              statusToken: checkoutNonce.nonce,
            }
          : {
              kind: 'iframe',
              checkoutSessionId: records.checkoutSessionId,
              iframeToken: result.iframeToken,
              expiresAt: result.expiresAt.toISOString(),
              statusToken: checkoutNonce.nonce,
            },
      );
    } catch (error) {
      const failure = sanitizeProviderMessage(
        error instanceof Error ? error.message : 'Provider checkout failed.',
      );
      await this.prisma.$transaction([
        this.prisma.checkoutSession.update({
          where: { id: records.checkoutSessionId },
          data: { state: 'FAILED', version: { increment: 1 } },
        }),
        this.prisma.guildSubscription.update({
          where: { id: records.subscriptionId },
          data: {
            status: 'CANCELLED',
            cancellationStatus: 'CANCELLED',
            endedAt: new Date(),
            version: { increment: 1 },
          },
        }),
        this.prisma.billingAuditEvent.create({
          data: {
            actorType: 'SYSTEM',
            guildId: input.guildId,
            subscriptionId: records.subscriptionId,
            action: 'billing.checkout.provider-failed',
            newValue: { failure },
            requestId: input.requestId,
            source: 'provider',
          },
        }),
      ]);
      throw error;
    }
  }

  public async getCheckoutStatus(input: {
    checkoutSessionId: string;
    statusToken: string;
    userId: string;
    now?: Date;
  }): Promise<{
    state: 'CREATED' | 'PROVIDER_PENDING' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED' | 'FAILED';
    subscriptionStatus: string;
    guildId: string;
  }> {
    const checkout = await this.prisma.checkoutSession.findUnique({
      where: { id: input.checkoutSessionId },
      include: { subscription: { select: { status: true } } },
    });
    if (
      checkout === null ||
      checkout.userId !== input.userId ||
      !verifyCheckoutNonce(input.statusToken, checkout.nonceHash)
    ) {
      throw new NotFoundError('Checkout session');
    }
    const now = input.now ?? new Date();
    if (
      checkout.expiresAt <= now &&
      (checkout.state === 'CREATED' || checkout.state === 'PROVIDER_PENDING')
    ) {
      const updated = await this.prisma.checkoutSession.update({
        where: { id: checkout.id },
        data: { state: 'EXPIRED', version: { increment: 1 } },
      });
      return {
        state: updated.state,
        subscriptionStatus: checkout.subscription.status,
        guildId: checkout.guildId,
      };
    }
    return {
      state: checkout.state,
      subscriptionStatus: checkout.subscription.status,
      guildId: checkout.guildId,
    };
  }

  #providerEnabled(provider: BillingProviderName): boolean {
    return provider === 'STRIPE'
      ? this.config.billing.providers.stripe.enabled
      : this.config.billing.providers.paytr.enabled;
  }
}
