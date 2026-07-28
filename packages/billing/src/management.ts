import type { DistributedCache } from '@sufbot/cache';
import type { AppConfig } from '@sufbot/config';
import type { PrismaClient } from '@sufbot/database/generated';
import { AuthorizationError, ConflictError, NotFoundError } from '@sufbot/shared';
import type {
  BillingProvider,
  BillingProviderName,
  GuildBillingStatus,
  ProviderSubscriptionSnapshot,
} from './contracts.js';
import { EntitlementService } from './entitlements.js';
import { SubscriptionReconciliationService } from './reconciliation.js';
import { createBillingIdempotencyKey } from './security.js';

type ProviderRegistry = ReadonlyMap<BillingProviderName, BillingProvider>;
type BillingCache = Pick<DistributedCache, 'getOrLoad' | 'invalidate' | 'publish'>;

const effectiveStatuses = [
  'PENDING',
  'INCOMPLETE',
  'ACTIVE',
  'PAST_DUE',
  'GRACE_PERIOD',
  'SUSPENDED',
  'CANCELLED',
  'DISPUTED',
] as const;

export class BillingManagementService {
  readonly #entitlements: EntitlementService;
  readonly #reconciliation: SubscriptionReconciliationService;

  public constructor(
    private readonly prisma: PrismaClient,
    private readonly config: AppConfig,
    private readonly providers: ProviderRegistry,
    cache?: BillingCache,
  ) {
    this.#entitlements = new EntitlementService(prisma, config, cache);
    this.#reconciliation = new SubscriptionReconciliationService(prisma, config, cache);
  }

  public async getGuildBillingStatus(guildId: string): Promise<GuildBillingStatus> {
    const [subscription, premiumActive] = await Promise.all([
      this.prisma.guildSubscription.findFirst({
        where: { guildId, status: { in: [...effectiveStatuses] } },
        orderBy: { createdAt: 'desc' },
      }),
      this.#entitlements.hasGuildEntitlement(guildId, 'premium'),
    ]);
    return {
      guildId,
      subscriptionId: subscription?.id ?? null,
      version: subscription?.version ?? null,
      planCode: subscription?.planCode ?? null,
      provider: subscription?.provider ?? null,
      status: subscription?.status ?? null,
      premiumActive,
      currentPeriodStart: subscription?.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
      gracePeriodEndsAt: subscription?.gracePeriodEndsAt?.toISOString() ?? null,
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
      cancellationStatus: subscription?.cancellationStatus ?? null,
      purchaserUserId: subscription?.purchaserUserId ?? null,
    };
  }

  public async listPayments(guildId: string, limit = 50) {
    return this.prisma.paymentTransaction.findMany({
      where: { guildId },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(limit, 100)),
      select: {
        id: true,
        provider: true,
        type: true,
        status: true,
        amountMinor: true,
        currency: true,
        paidAt: true,
        createdAt: true,
      },
    });
  }

  public async listAuditEvents(guildId: string, limit = 50) {
    return this.prisma.billingAuditEvent.findMany({
      where: { guildId },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(limit, 100)),
      select: {
        id: true,
        action: true,
        actorType: true,
        source: true,
        createdAt: true,
        requestId: true,
      },
    });
  }

  public async cancelAtPeriodEnd(input: {
    guildId: string;
    userId: string;
    subscriptionId: string;
    expectedVersion: number;
    idempotencyKey: string;
    requestId: string;
  }): Promise<GuildBillingStatus> {
    const subscription = await this.#ownedSubscription(input);
    if (subscription.cancelAtPeriodEnd) return this.getGuildBillingStatus(input.guildId);
    const provider = this.#provider(subscription.provider);
    await provider.cancelSubscription({
      providerSubscriptionId: subscription.providerSubscriptionId,
      atPeriodEnd: true,
      idempotencyKey: createBillingIdempotencyKey(
        subscription.provider,
        'subscription.cancel',
        `${subscription.id}:${input.idempotencyKey}`,
      ),
    });
    await this.#reconcileAuthoritative(subscription.id, input.requestId, input.userId);
    return this.getGuildBillingStatus(input.guildId);
  }

  public async resume(input: {
    guildId: string;
    userId: string;
    subscriptionId: string;
    expectedVersion: number;
    idempotencyKey: string;
    requestId: string;
  }): Promise<GuildBillingStatus> {
    const subscription = await this.#ownedSubscription(input);
    if (!subscription.cancelAtPeriodEnd || subscription.cancellationStatus !== 'SCHEDULED') {
      throw new ConflictError('Only a subscription scheduled to cancel can be resumed.');
    }
    const provider = this.#provider(subscription.provider);
    await provider.resumeSubscription({
      providerSubscriptionId: subscription.providerSubscriptionId,
      idempotencyKey: createBillingIdempotencyKey(
        subscription.provider,
        'subscription.resume',
        `${subscription.id}:${input.idempotencyKey}`,
      ),
    });
    await this.#reconcileAuthoritative(subscription.id, input.requestId, input.userId);
    return this.getGuildBillingStatus(input.guildId);
  }

  public async createManagementSession(input: {
    guildId: string;
    userId: string;
    subscriptionId: string;
    returnUrl: string;
  }): Promise<{ url: string; expiresAt?: Date }> {
    const subscription = await this.#ownedSubscription({
      ...input,
      expectedVersion: undefined,
    });
    if (subscription.providerCustomerId === null) {
      throw new ConflictError('The subscription has no verified provider customer mapping.');
    }
    const provider = this.#provider(subscription.provider);
    if (provider.createManagementSession === undefined) {
      throw new ConflictError('The provider does not support a management portal.');
    }
    return provider.createManagementSession({
      providerCustomerId: subscription.providerCustomerId,
      returnUrl: input.returnUrl,
    });
  }

  public async reconcile(input: {
    guildId: string;
    userId: string;
    subscriptionId: string;
    requestId: string;
  }): Promise<GuildBillingStatus> {
    const subscription = await this.#ownedSubscription({
      ...input,
      expectedVersion: undefined,
    });
    await this.#reconcileAuthoritative(subscription.id, input.requestId, input.userId);
    return this.getGuildBillingStatus(input.guildId);
  }

  public async reconcileAsSystem(input: {
    subscriptionId: string;
    requestId: string;
  }): Promise<{ guildId: string; status: GuildBillingStatus }> {
    const subscription = await this.prisma.guildSubscription.findUnique({
      where: { id: input.subscriptionId },
      select: { guildId: true },
    });
    if (subscription === null) throw new NotFoundError('Guild subscription');
    await this.#reconcileAuthoritative(input.subscriptionId, input.requestId);
    return {
      guildId: subscription.guildId,
      status: await this.getGuildBillingStatus(subscription.guildId),
    };
  }

  async #ownedSubscription(input: {
    guildId: string;
    userId: string;
    subscriptionId: string;
    expectedVersion: number | undefined;
  }) {
    const subscription = await this.prisma.guildSubscription.findUnique({
      where: { id: input.subscriptionId },
    });
    if (subscription === null || subscription.guildId !== input.guildId) {
      throw new NotFoundError('Guild subscription');
    }
    if (subscription.purchaserUserId !== input.userId) {
      throw new AuthorizationError(
        'Only the verified billing owner can manage this subscription.',
        'BILLING_OWNER_REQUIRED',
      );
    }
    if (input.expectedVersion !== undefined && subscription.version !== input.expectedVersion) {
      throw new ConflictError('The subscription changed; refresh before trying again.');
    }
    if (subscription.providerSubscriptionId === null) {
      throw new ConflictError('The subscription is not yet bound to a provider subscription.');
    }
    return {
      ...subscription,
      providerSubscriptionId: subscription.providerSubscriptionId,
    };
  }

  #provider(providerName: BillingProviderName): BillingProvider {
    const provider = this.providers.get(providerName);
    if (provider === undefined) throw new NotFoundError('Billing provider');
    return provider;
  }

  async #reconcileAuthoritative(
    subscriptionId: string,
    requestId: string,
    actorUserId?: string,
  ): Promise<void> {
    const current = await this.prisma.guildSubscription.findUniqueOrThrow({
      where: { id: subscriptionId },
    });
    if (current.providerSubscriptionId === null) {
      throw new ConflictError('The subscription is not bound to a provider subscription.');
    }
    const result = await this.#provider(current.provider).reconcileSubscription({
      id: current.id,
      provider: current.provider,
      providerSubscriptionId: current.providerSubscriptionId,
      status: current.status,
      version: current.version,
    });
    if (!result.authoritative) {
      throw new ConflictError('The provider state could not be authoritatively reconciled.');
    }
    const state = this.#stateFromSnapshot(current.status, result.snapshot);
    const unchanged =
      current.providerStateVersion === result.snapshot.providerStateVersion &&
      current.status === state.nextStatus &&
      current.cancelAtPeriodEnd === result.snapshot.cancelAtPeriodEnd;
    if (unchanged) return;
    await this.#reconciliation.applyState({
      subscriptionId: current.id,
      expectedVersion: current.version,
      nextStatus: state.nextStatus,
      latestPaymentStatus: result.snapshot.latestPaymentStatus,
      currentPeriodStart: result.snapshot.currentPeriodStart ?? null,
      currentPeriodEnd: result.snapshot.currentPeriodEnd ?? null,
      gracePeriodEndsAt: state.gracePeriodEndsAt,
      cancellationStatus: state.cancellationStatus,
      cancelAtPeriodEnd: result.snapshot.cancelAtPeriodEnd,
      ...(state.cancelledAt === undefined ? {} : { cancelledAt: state.cancelledAt }),
      ...(state.endedAt === undefined ? {} : { endedAt: state.endedAt }),
      providerStateVersion: result.snapshot.providerStateVersion ?? null,
      providerUpdatedAt: result.snapshot.providerUpdatedAt ?? new Date(),
      requestId,
      source: 'reconciliation',
      actorType: 'SYSTEM',
      ...(actorUserId === undefined ? {} : { actorUserId }),
    });
  }

  #stateFromSnapshot(
    currentStatus: string,
    snapshot: ProviderSubscriptionSnapshot,
  ): {
    nextStatus:
      | 'PENDING'
      | 'INCOMPLETE'
      | 'ACTIVE'
      | 'PAST_DUE'
      | 'GRACE_PERIOD'
      | 'SUSPENDED'
      | 'CANCELLED'
      | 'EXPIRED'
      | 'DISPUTED'
      | 'REFUNDED';
    cancellationStatus: 'NONE' | 'SCHEDULED' | 'CANCELLED';
    gracePeriodEndsAt: Date | null;
    cancelledAt?: Date;
    endedAt?: Date;
  } {
    const now = new Date();
    if (snapshot.cancelAtPeriodEnd && snapshot.currentPeriodEnd !== undefined) {
      return {
        nextStatus: 'CANCELLED',
        cancellationStatus: 'SCHEDULED',
        gracePeriodEndsAt: null,
        cancelledAt: now,
      };
    }
    if (snapshot.status === 'ACTIVE' && snapshot.latestPaymentStatus !== 'SUCCEEDED') {
      if (currentStatus === 'ACTIVE' || currentStatus === 'CANCELLED') {
        throw new ConflictError(
          'Provider payment state is ambiguous; entitlement was not expanded.',
        );
      }
      return {
        nextStatus: 'INCOMPLETE',
        cancellationStatus: 'NONE',
        gracePeriodEndsAt: null,
      };
    }
    if (snapshot.status === 'PAST_DUE' && this.config.billing.gracePeriodDays > 0) {
      return {
        nextStatus: 'GRACE_PERIOD',
        cancellationStatus: 'NONE',
        gracePeriodEndsAt: new Date(
          now.getTime() + this.config.billing.gracePeriodDays * 86_400_000,
        ),
      };
    }
    if (
      (snapshot.status === 'CANCELLED' || snapshot.status === 'EXPIRED') &&
      snapshot.currentPeriodEnd !== undefined &&
      snapshot.currentPeriodEnd <= now
    ) {
      return {
        nextStatus: 'EXPIRED',
        cancellationStatus: 'CANCELLED',
        gracePeriodEndsAt: null,
        cancelledAt: now,
        endedAt: snapshot.currentPeriodEnd,
      };
    }
    return {
      nextStatus: snapshot.status,
      cancellationStatus:
        snapshot.status === 'CANCELLED' || snapshot.status === 'EXPIRED' ? 'CANCELLED' : 'NONE',
      gracePeriodEndsAt: null,
      ...(snapshot.status === 'CANCELLED' ? { cancelledAt: now } : {}),
    };
  }
}
