import type { DistributedCache } from '@sufbot/cache';
import type { AppConfig } from '@sufbot/config';
import { sanitizeAuditValue } from '@sufbot/database';
import type { PrismaClient } from '@sufbot/database/generated';
import { ConflictError, NotFoundError } from '@sufbot/shared';
import { entitlementsForFeatureSet } from './catalogue.js';
import {
  SubscriptionStatusSchema,
  type SubscriptionStatus,
} from './contracts.js';
import { EntitlementService } from './entitlements.js';
import {
  assertSubscriptionTransition,
  subscriptionGrantsPremium,
} from './state-machine.js';

export type SubscriptionStateUpdate = {
  subscriptionId: string;
  nextStatus: SubscriptionStatus;
  expectedVersion: number;
  latestPaymentStatus?:
    | 'PENDING'
    | 'SUCCEEDED'
    | 'FAILED'
    | 'REFUNDED'
    | 'PARTIALLY_REFUNDED'
    | 'DISPUTED'
    | 'REVERSED'
    | 'UNKNOWN';
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  gracePeriodEndsAt?: Date | null;
  cancellationStatus?: 'NONE' | 'SCHEDULED' | 'CANCELLED';
  cancelAtPeriodEnd?: boolean;
  cancelledAt?: Date | null;
  endedAt?: Date | null;
  providerStateVersion?: string | null;
  providerUpdatedAt?: Date | null;
  requestId: string;
  source: 'webhook' | 'callback' | 'reconciliation' | 'worker' | 'admin';
  actorType?: 'SYSTEM' | 'WORKER' | 'PROVIDER' | 'STAFF';
  actorUserId?: string;
  now?: Date;
};

type BillingCache = Pick<DistributedCache, 'getOrLoad' | 'invalidate' | 'publish'>;

export class SubscriptionReconciliationService {
  private readonly entitlements: EntitlementService;

  public constructor(
    private readonly prisma: PrismaClient,
    config: AppConfig,
    cache?: BillingCache,
  ) {
    this.entitlements = new EntitlementService(prisma, config, cache);
  }

  public async applyState(
    input: SubscriptionStateUpdate,
  ): Promise<{ subscriptionId: string; guildId: string; version: number; entitlementVersion: number }> {
    const nextStatus = SubscriptionStatusSchema.parse(input.nextStatus);
    const now = input.now ?? new Date();
    const result = await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.guildSubscription.findUnique({
        where: { id: input.subscriptionId },
      });
      if (current === null) throw new NotFoundError('Guild subscription');
      if (current.version !== input.expectedVersion) {
        throw new ConflictError('Subscription was changed by another billing event.');
      }
      if (
        input.providerUpdatedAt !== undefined &&
        input.providerUpdatedAt !== null &&
        current.providerUpdatedAt !== null &&
        input.providerUpdatedAt < current.providerUpdatedAt
      ) {
        throw new ConflictError(
          'Provider state is older than the last reconciled state; authoritative retrieval is required.',
        );
      }
      assertSubscriptionTransition(current.status, nextStatus);
      if (
        nextStatus === 'GRACE_PERIOD' &&
        (input.gracePeriodEndsAt === undefined || input.gracePeriodEndsAt === null)
      ) {
        throw new ConflictError('A grace-period transition requires a bounded grace end.');
      }

      const updatedCount = await transaction.guildSubscription.updateMany({
        where: { id: current.id, version: current.version },
        data: {
          status: nextStatus,
          version: { increment: 1 },
          ...(input.latestPaymentStatus === undefined
            ? {}
            : { latestPaymentStatus: input.latestPaymentStatus }),
          ...(input.currentPeriodStart === undefined
            ? {}
            : { currentPeriodStart: input.currentPeriodStart }),
          ...(input.currentPeriodEnd === undefined
            ? {}
            : { currentPeriodEnd: input.currentPeriodEnd }),
          ...(input.gracePeriodEndsAt === undefined
            ? {}
            : { gracePeriodEndsAt: input.gracePeriodEndsAt }),
          ...(input.cancellationStatus === undefined
            ? {}
            : { cancellationStatus: input.cancellationStatus }),
          ...(input.cancelAtPeriodEnd === undefined
            ? {}
            : { cancelAtPeriodEnd: input.cancelAtPeriodEnd }),
          ...(input.cancelledAt === undefined ? {} : { cancelledAt: input.cancelledAt }),
          ...(input.endedAt === undefined ? {} : { endedAt: input.endedAt }),
          ...(input.providerStateVersion === undefined
            ? {}
            : { providerStateVersion: input.providerStateVersion }),
          ...(input.providerUpdatedAt === undefined
            ? {}
            : { providerUpdatedAt: input.providerUpdatedAt }),
        },
      });
      if (updatedCount.count !== 1) {
        throw new ConflictError('Concurrent subscription reconciliation was rejected.');
      }
      const updated = await transaction.guildSubscription.findUniqueOrThrow({
        where: { id: current.id },
      });

      const grant = subscriptionGrantsPremium(updated, now);
      const desiredEntitlements = grant.grants
        ? entitlementsForFeatureSet(updated.featureSetVersion)
        : [];
      const existing = await transaction.guildEntitlement.findMany({
        where: {
          guildId: updated.guildId,
          source: 'SUBSCRIPTION',
          sourceReference: updated.id,
        },
        select: { id: true, entitlementKey: true },
      });
      const desiredSet = new Set<string>(desiredEntitlements);
      for (const entitlementKey of desiredEntitlements) {
        await transaction.guildEntitlement.upsert({
          where: {
            guildId_entitlementKey_source_sourceReference: {
              guildId: updated.guildId,
              entitlementKey,
              source: 'SUBSCRIPTION',
              sourceReference: updated.id,
            },
          },
          create: {
            guildId: updated.guildId,
            entitlementKey,
            source: 'SUBSCRIPTION',
            sourceReference: updated.id,
            subscriptionId: updated.id,
            startsAt: updated.currentPeriodStart ?? now,
            endsAt: grant.endsAt,
            status: 'ACTIVE',
            metadata: {
              planCode: updated.planCode,
              featureSetVersion: updated.featureSetVersion,
            },
          },
          update: {
            subscriptionId: updated.id,
            endsAt: grant.endsAt,
            status: 'ACTIVE',
            metadata: {
              planCode: updated.planCode,
              featureSetVersion: updated.featureSetVersion,
            },
          },
        });
      }
      const revokeIds = existing
        .filter((entitlement) => !desiredSet.has(entitlement.entitlementKey))
        .map((entitlement) => entitlement.id);
      if (revokeIds.length > 0) {
        await transaction.guildEntitlement.updateMany({
          where: { id: { in: revokeIds } },
          data: { status: 'REVOKED', endsAt: now },
        });
      }
      const guild = await transaction.guild.update({
        where: { id: updated.guildId },
        data: { billingEntitlementVersion: { increment: 1 } },
        select: { billingEntitlementVersion: true },
      });
      await transaction.billingAuditEvent.create({
        data: {
          actorType: input.actorType ?? 'PROVIDER',
          ...(input.actorUserId === undefined ? {} : { actorUserId: input.actorUserId }),
          guildId: updated.guildId,
          subscriptionId: updated.id,
          action: 'billing.subscription.state-reconciled',
          previousValue: sanitizeAuditValue({
            status: current.status,
            version: current.version,
            periodStart: current.currentPeriodStart,
            periodEnd: current.currentPeriodEnd,
            latestPaymentStatus: current.latestPaymentStatus,
          }),
          newValue: sanitizeAuditValue({
            status: updated.status,
            version: updated.version,
            periodStart: updated.currentPeriodStart,
            periodEnd: updated.currentPeriodEnd,
            latestPaymentStatus: updated.latestPaymentStatus,
            entitlementKeys: desiredEntitlements,
          }),
          requestId: input.requestId,
          source: input.source,
        },
      });
      return {
        subscriptionId: updated.id,
        guildId: updated.guildId,
        version: updated.version,
        entitlementVersion: guild.billingEntitlementVersion,
      };
    });

    await this.entitlements.invalidateGuildEntitlements(
      result.guildId,
      result.entitlementVersion,
      result.subscriptionId,
    );
    return result;
  }
}
