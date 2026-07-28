import { createHash } from 'node:crypto';
import type { DistributedCache } from '@sufbot/cache';
import type { AppConfig } from '@sufbot/config';
import type { PrismaClient } from '@sufbot/database/generated';
import { AppError, ConflictError, NotFoundError } from '@sufbot/shared';
import type {
  BillingProvider,
  BillingProviderName,
  BillingWorkerPayload,
  NormalizedProviderEvent,
  RawWebhookInput,
  SubscriptionStatus,
} from './contracts.js';
import {
  SubscriptionReconciliationService,
  type SubscriptionStateUpdate,
} from './reconciliation.js';
import { sanitizeProviderMessage } from './security.js';

type ProviderRegistry = ReadonlyMap<BillingProviderName, BillingProvider>;
type BillingCache = Pick<DistributedCache, 'getOrLoad' | 'invalidate' | 'publish'>;

const rawPayloadHash = (rawBody: Buffer): string =>
  createHash('sha256').update(rawBody).digest('hex');

const isUniqueConstraintError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';

export type ProviderEventProcessingResult = {
  providerEventRecordId: string;
  duplicate: boolean;
  processed: boolean;
  subscriptionId?: string;
};

export class BillingProviderEventService {
  readonly #reconciliation: SubscriptionReconciliationService;

  public constructor(
    private readonly prisma: PrismaClient,
    private readonly config: AppConfig,
    private readonly providers: ProviderRegistry,
    cache?: BillingCache,
    private readonly enqueueBillingJob?: (payload: BillingWorkerPayload) => Promise<unknown>,
  ) {
    this.#reconciliation = new SubscriptionReconciliationService(prisma, config, cache);
  }

  public async ingestWebhook(
    providerName: BillingProviderName,
    input: RawWebhookInput,
  ): Promise<ProviderEventProcessingResult> {
    const provider = this.providers.get(providerName);
    if (provider === undefined) {
      throw new AppError({
        code: 'BILLING_PROVIDER_NOT_REGISTERED',
        message: 'Billing provider is not registered.',
        statusCode: 503,
        expose: false,
      });
    }
    const normalized = await provider.verifyAndParseWebhook(input);
    const payloadHash = rawPayloadHash(input.rawBody);
    let record: { id: string; processingStatus: string };
    let duplicate = false;
    try {
      record = await this.prisma.billingProviderEvent.create({
        data: {
          provider: normalized.provider,
          providerEventId: normalized.providerEventId,
          eventType: normalized.type,
          environment: normalized.environment,
          payloadHash,
          payloadSummary: {
            providerObjectId: normalized.providerObjectId,
            providerSubscriptionId: normalized.providerSubscriptionId,
            internalCheckoutSessionId: normalized.internalCheckoutSessionId,
          },
          signatureVerified: true,
          providerEventCreatedAt: new Date(normalized.occurredAt),
          receivedAt: input.receivedAt,
          correlationId: input.correlationId,
        },
        select: { id: true, processingStatus: true },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const existing = await this.prisma.billingProviderEvent.findUnique({
        where: {
          provider_providerEventId: {
            provider: normalized.provider,
            providerEventId: normalized.providerEventId,
          },
        },
        select: {
          id: true,
          processingStatus: true,
          payloadHash: true,
          signatureVerified: true,
        },
      });
      if (
        existing === null ||
        existing.payloadHash !== payloadHash ||
        !existing.signatureVerified
      ) {
        throw new ConflictError('Provider event replay payload does not match the original.');
      }
      record = existing;
      duplicate = true;
      if (
        existing.processingStatus === 'PROCESSED' ||
        existing.processingStatus === 'IGNORED' ||
        existing.processingStatus === 'PROCESSING'
      ) {
        return {
          providerEventRecordId: existing.id,
          duplicate: true,
          processed: existing.processingStatus === 'PROCESSED',
        };
      }
    }

    try {
      const subscriptionId = await this.#process(record.id, normalized);
      return {
        providerEventRecordId: record.id,
        duplicate,
        processed: true,
        subscriptionId,
      };
    } catch (error) {
      await this.prisma.billingProviderEvent.update({
        where: { id: record.id },
        data: {
          processingStatus: 'FAILED',
          attemptCount: { increment: 1 },
          failureCode:
            error instanceof AppError
              ? error.code.slice(0, 100)
              : 'PROVIDER_EVENT_PROCESSING_FAILED',
          lastErrorSanitized: sanitizeProviderMessage(
            error instanceof Error ? error.message : 'Provider event processing failed.',
          ),
        },
      });
      throw error;
    }
  }

  async #process(providerEventRecordId: string, event: NormalizedProviderEvent): Promise<string> {
    await this.prisma.billingProviderEvent.update({
      where: { id: providerEventRecordId },
      data: { processingStatus: 'PROCESSING' },
    });
    const subscription = await this.#bindAndLoadSubscription(event);
    const occurredAt = new Date(event.occurredAt);

    if (
      (event.type === 'subscription.activated' || event.type === 'subscription.renewed') &&
      event.amountMinor !== undefined &&
      (event.amountMinor !== subscription.amountMinorSnapshot ||
        event.currency !== subscription.currencySnapshot)
    ) {
      throw new ConflictError(
        'Provider payment amount or currency does not match the purchased plan snapshot.',
      );
    }

    if (event.type === 'subscription.refunded' && !event.fullRefund) {
      await this.#recordPartialRefund(providerEventRecordId, event, subscription, occurredAt);
      return subscription.id;
    }

    let nextStatus: SubscriptionStatus;
    const state: Omit<
      SubscriptionStateUpdate,
      'subscriptionId' | 'nextStatus' | 'expectedVersion' | 'requestId' | 'source'
    > = {
      providerEventRecordId,
      ...(event.providerStateVersion === undefined
        ? {}
        : { providerStateVersion: event.providerStateVersion }),
      providerUpdatedAt: occurredAt,
      actorType: 'PROVIDER',
      now: occurredAt,
    };

    switch (event.type) {
      case 'subscription.pending':
        nextStatus = subscription.status === 'PENDING' ? 'INCOMPLETE' : subscription.status;
        state.latestPaymentStatus = 'PENDING';
        break;
      case 'subscription.activated':
      case 'subscription.renewed': {
        nextStatus = 'ACTIVE';
        state.latestPaymentStatus = 'SUCCEEDED';
        state.currentPeriodStart = new Date(event.periodStart);
        state.currentPeriodEnd = new Date(event.periodEnd);
        state.gracePeriodEndsAt = null;
        state.cancelAtPeriodEnd = false;
        state.cancellationStatus = 'NONE';
        const succeededCount = await this.prisma.paymentTransaction.count({
          where: { subscriptionId: subscription.id, status: 'SUCCEEDED' },
        });
        if (event.amountMinor !== undefined && event.currency !== undefined) {
          state.payment = {
            provider: event.provider,
            ...(event.providerPaymentId === undefined
              ? {}
              : { providerPaymentId: event.providerPaymentId }),
            ...(event.providerInvoiceId === undefined
              ? {}
              : { providerInvoiceId: event.providerInvoiceId }),
            idempotencyKey: event.providerEventId,
            type:
              event.type === 'subscription.renewed' || succeededCount > 0 ? 'RENEWAL' : 'INITIAL',
            status: 'SUCCEEDED',
            amountMinor: event.amountMinor,
            currency: event.currency,
            paidAt: occurredAt,
          };
        }
        break;
      }
      case 'subscription.payment_failed':
        if (subscription.status === 'PENDING' || subscription.status === 'INCOMPLETE') {
          nextStatus = 'INCOMPLETE';
        } else if (this.config.billing.gracePeriodDays > 0) {
          nextStatus = 'GRACE_PERIOD';
          state.gracePeriodEndsAt = new Date(
            occurredAt.getTime() + this.config.billing.gracePeriodDays * 86_400_000,
          );
        } else {
          nextStatus = 'SUSPENDED';
        }
        state.latestPaymentStatus = 'FAILED';
        break;
      case 'subscription.grace_started':
        nextStatus = 'GRACE_PERIOD';
        state.latestPaymentStatus = 'FAILED';
        state.gracePeriodEndsAt = new Date(event.gracePeriodEndsAt);
        break;
      case 'subscription.cancel_scheduled':
        nextStatus = 'CANCELLED';
        state.cancelAtPeriodEnd = true;
        state.cancellationStatus = 'SCHEDULED';
        state.cancelledAt = occurredAt;
        state.currentPeriodEnd = new Date(event.periodEnd);
        break;
      case 'subscription.cancelled':
        nextStatus = 'CANCELLED';
        state.cancelAtPeriodEnd = false;
        state.cancellationStatus = 'CANCELLED';
        state.cancelledAt = occurredAt;
        state.endedAt = new Date(event.effectiveAt);
        state.currentPeriodEnd = new Date(event.effectiveAt);
        break;
      case 'subscription.expired':
        nextStatus = 'EXPIRED';
        state.cancelAtPeriodEnd = false;
        state.cancellationStatus = 'CANCELLED';
        state.endedAt = new Date(event.effectiveAt);
        state.currentPeriodEnd = new Date(event.effectiveAt);
        break;
      case 'subscription.refunded':
        nextStatus = 'REFUNDED';
        state.latestPaymentStatus = 'REFUNDED';
        state.currentPeriodEnd = occurredAt;
        state.endedAt = occurredAt;
        state.payment = {
          provider: event.provider,
          providerPaymentId: event.providerPaymentId,
          idempotencyKey: event.providerEventId,
          type: 'REFUND',
          status: 'REFUNDED',
          amountMinor: event.amountMinor,
          currency: event.currency,
          refundedAt: occurredAt,
        };
        break;
      case 'subscription.disputed':
        nextStatus = 'DISPUTED';
        state.latestPaymentStatus = 'DISPUTED';
        state.payment = {
          provider: event.provider,
          providerPaymentId: event.providerPaymentId,
          idempotencyKey: event.providerEventId,
          type: 'CHARGEBACK',
          status: 'DISPUTED',
          amountMinor: event.amountMinor,
          currency: event.currency,
          disputedAt: occurredAt,
        };
        break;
      case 'subscription.dispute_resolved': {
        const provider = this.providers.get(event.provider);
        if (provider === undefined) throw new NotFoundError('Billing provider');
        const snapshot = await provider.retrieveSubscription(event.providerSubscriptionId);
        nextStatus =
          snapshot.status === 'ACTIVE' && snapshot.latestPaymentStatus === 'SUCCEEDED'
            ? 'ACTIVE'
            : 'SUSPENDED';
        state.latestPaymentStatus =
          nextStatus === 'ACTIVE' ? 'SUCCEEDED' : snapshot.latestPaymentStatus;
        if (snapshot.currentPeriodStart !== undefined) {
          state.currentPeriodStart = snapshot.currentPeriodStart;
        }
        if (snapshot.currentPeriodEnd !== undefined) {
          state.currentPeriodEnd = snapshot.currentPeriodEnd;
        }
        state.payment = {
          provider: event.provider,
          providerPaymentId: event.providerPaymentId,
          idempotencyKey: event.providerEventId,
          type: 'REVERSAL',
          status: 'REVERSED',
          amountMinor: event.amountMinor,
          currency: event.currency,
        };
        break;
      }
    }

    await this.#reconciliation.applyState({
      subscriptionId: subscription.id,
      nextStatus,
      expectedVersion: subscription.version,
      requestId: event.correlationId,
      source: 'webhook',
      ...state,
    });
    if (nextStatus === 'ACTIVE') {
      await this.prisma.checkoutSession.updateMany({
        where: { subscriptionId: subscription.id, state: 'PROVIDER_PENDING' },
        data: {
          state: 'COMPLETED',
          completedAt: occurredAt,
          version: { increment: 1 },
        },
      });
    } else if (
      event.type === 'subscription.payment_failed' &&
      (subscription.status === 'PENDING' || subscription.status === 'INCOMPLETE')
    ) {
      await this.prisma.checkoutSession.updateMany({
        where: {
          subscriptionId: subscription.id,
          state: { in: ['CREATED', 'PROVIDER_PENDING'] },
        },
        data: { state: 'FAILED', version: { increment: 1 } },
      });
    }
    const notificationJob =
      event.type === 'subscription.payment_failed'
        ? 'billing.send-payment-failed-notification'
        : event.type === 'subscription.cancel_scheduled'
          ? 'billing.send-cancellation-notification'
          : event.type === 'subscription.activated' || event.type === 'subscription.renewed'
            ? 'billing.send-renewal-confirmation'
            : undefined;
    if (notificationJob !== undefined && this.enqueueBillingJob !== undefined) {
      await this.enqueueBillingJob({
        job: notificationJob,
        subscriptionId: subscription.id,
        correlationId: event.correlationId,
      }).catch(() => undefined);
    }
    if (
      (event.type === 'subscription.activated' ||
        event.type === 'subscription.renewed' ||
        event.type === 'subscription.cancel_scheduled') &&
      this.enqueueBillingJob !== undefined
    ) {
      await this.enqueueBillingJob({
        job: 'billing.expire-entitlement',
        guildId: subscription.guildId,
        subscriptionId: subscription.id,
        expectedAt: event.periodEnd,
        correlationId: event.correlationId,
      }).catch(() => undefined);
    }
    return subscription.id;
  }

  async #bindAndLoadSubscription(event: NormalizedProviderEvent) {
    if (event.internalCheckoutSessionId !== undefined) {
      const checkout = await this.prisma.checkoutSession.findUnique({
        where: { id: event.internalCheckoutSessionId },
        include: { subscription: true },
      });
      const eventOccurredAt = new Date(event.occurredAt);
      if (
        checkout === null ||
        checkout.provider !== event.provider ||
        checkout.environment !== event.environment ||
        checkout.providerSessionId !== event.providerObjectId ||
        checkout.subscription.provider !== event.provider ||
        checkout.guildId !== checkout.subscription.guildId ||
        checkout.userId !== checkout.subscription.purchaserUserId ||
        checkout.planCode !== checkout.subscription.planCode ||
        checkout.expiresAt < eventOccurredAt
      ) {
        throw new ConflictError('Provider checkout binding validation failed.');
      }
      if (
        checkout.subscription.providerSubscriptionId !== null &&
        checkout.subscription.providerSubscriptionId !== event.providerSubscriptionId
      ) {
        throw new ConflictError('Provider subscription binding cannot be replaced.');
      }
      await this.prisma.$transaction(async (transaction) => {
        await transaction.guildSubscription.update({
          where: { id: checkout.subscriptionId },
          data: {
            providerSubscriptionId: event.providerSubscriptionId,
            ...(event.providerCustomerId === undefined
              ? {}
              : { providerCustomerId: event.providerCustomerId }),
          },
        });
        if (event.providerCustomerId !== undefined) {
          const mapping = await transaction.billingCustomer.findUnique({
            where: {
              userId_provider: {
                userId: checkout.userId,
                provider: event.provider,
              },
            },
          });
          if (mapping !== null && mapping.providerCustomerId !== event.providerCustomerId) {
            throw new ConflictError('Provider customer binding cannot be replaced.');
          }
          await transaction.billingCustomer.upsert({
            where: {
              userId_provider: {
                userId: checkout.userId,
                provider: event.provider,
              },
            },
            create: {
              userId: checkout.userId,
              provider: event.provider,
              providerCustomerId: event.providerCustomerId,
            },
            update: { status: 'ACTIVE' },
          });
        }
      });
      return this.prisma.guildSubscription.findUniqueOrThrow({
        where: { id: checkout.subscriptionId },
      });
    }
    const subscription = await this.prisma.guildSubscription.findUnique({
      where: {
        provider_providerSubscriptionId: {
          provider: event.provider,
          providerSubscriptionId: event.providerSubscriptionId,
        },
      },
    });
    if (subscription === null) throw new NotFoundError('Provider subscription mapping');
    return subscription;
  }

  async #recordPartialRefund(
    providerEventRecordId: string,
    event: Extract<NormalizedProviderEvent, { type: 'subscription.refunded' }>,
    subscription: {
      id: string;
      guildId: string;
      purchaserUserId: string;
    },
    refundedAt: Date,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.paymentTransaction.upsert({
        where: {
          provider_idempotencyKey: {
            provider: event.provider,
            idempotencyKey: event.providerEventId,
          },
        },
        create: {
          guildId: subscription.guildId,
          purchaserUserId: subscription.purchaserUserId,
          subscriptionId: subscription.id,
          provider: event.provider,
          providerPaymentId: event.providerPaymentId,
          idempotencyKey: event.providerEventId,
          type: 'PARTIAL_REFUND',
          status: 'PARTIALLY_REFUNDED',
          amountMinor: event.amountMinor,
          currency: event.currency,
          refundedAt,
        },
        update: {
          status: 'PARTIALLY_REFUNDED',
          amountMinor: event.amountMinor,
          refundedAt,
        },
      });
      await transaction.billingAuditEvent.create({
        data: {
          actorType: 'PROVIDER',
          guildId: subscription.guildId,
          subscriptionId: subscription.id,
          action: 'billing.payment.partial-refund-recorded',
          newValue: {
            amountMinor: event.amountMinor,
            currency: event.currency,
          },
          requestId: event.correlationId,
          source: 'webhook',
        },
      });
      await transaction.billingProviderEvent.update({
        where: { id: providerEventRecordId },
        data: {
          processingStatus: 'PROCESSED',
          processedAt: refundedAt,
          attemptCount: { increment: 1 },
        },
      });
    });
  }
}
