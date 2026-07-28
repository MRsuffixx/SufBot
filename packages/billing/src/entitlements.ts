import { z } from 'zod';
import type { DistributedCache } from '@sufbot/cache';
import type { AppConfig } from '@sufbot/config';
import type { PrismaClient } from '@sufbot/database/generated';
import { AuthorizationError, DiscordSnowflakeSchema } from '@sufbot/shared';
import { PremiumEntitlement, type PremiumEntitlementKey } from './catalogue.js';
import type { GuildBillingStatus } from './contracts.js';

const EntitlementRecordSchema = z
  .object({
    key: z.string().min(1).max(100),
    source: z.enum(['SUBSCRIPTION', 'MANUAL_PROMOTION', 'ADMIN_OVERRIDE']),
    subscriptionId: z.uuid().nullable(),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime().nullable(),
  })
  .strict();

const EntitlementSnapshotSchema = z
  .object({
    version: z.number().int().positive(),
    cachedAt: z.iso.datetime(),
    nextBoundaryAt: z.iso.datetime().nullable(),
    entitlements: z.array(EntitlementRecordSchema),
  })
  .strict();

type EntitlementSnapshot = z.infer<typeof EntitlementSnapshotSchema>;
export type GuildEntitlementView = z.infer<typeof EntitlementRecordSchema>;

type EntitlementCache = Pick<DistributedCache, 'getOrLoad' | 'invalidate' | 'publish'>;

export class EntitlementService {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly config: AppConfig,
    private readonly cache?: EntitlementCache,
  ) {}

  public async hasGuildEntitlement(
    guildId: string,
    entitlementKey: string,
    at = new Date(),
  ): Promise<boolean> {
    const entitlements = await this.listGuildEntitlements(guildId, at);
    return entitlements.some((entitlement) => entitlement.key === entitlementKey);
  }

  public async requireGuildEntitlement(
    guildId: string,
    entitlementKey: string,
    at = new Date(),
  ): Promise<void> {
    if (!(await this.hasGuildEntitlement(guildId, entitlementKey, at))) {
      throw new AuthorizationError(
        `The ${entitlementKey} entitlement is required for this guild.`,
        'PREMIUM_REQUIRED',
      );
    }
  }

  public async listGuildEntitlements(
    guildId: string,
    at = new Date(),
  ): Promise<GuildEntitlementView[]> {
    DiscordSnowflakeSchema.parse(guildId);
    const isCurrentRead = Math.abs(Date.now() - at.getTime()) <= 1_000;
    if (this.cache === undefined || !isCurrentRead) {
      const direct = await this.loadDatabaseSnapshot(guildId, at);
      return direct?.entitlements ?? [];
    }

    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
      select: { billingEntitlementVersion: true },
    });
    if (guild === null) return [];

    const load = async (): Promise<EntitlementSnapshot> => {
      const snapshot = await this.loadDatabaseSnapshot(guildId, new Date());
      return (
        snapshot ?? {
          version: guild.billingEntitlementVersion,
          cachedAt: new Date().toISOString(),
          nextBoundaryAt: null,
          entitlements: [],
        }
      );
    };

    let snapshot = await this.cache.getOrLoad(
      guildId,
      'billing:entitlements',
      EntitlementSnapshotSchema,
      load,
    );
    const cacheAgeMs = Date.now() - Date.parse(snapshot.cachedAt);
    const boundaryPassed =
      snapshot.nextBoundaryAt !== null && Date.parse(snapshot.nextBoundaryAt) <= Date.now();
    if (
      snapshot.version !== guild.billingEntitlementVersion ||
      boundaryPassed ||
      cacheAgeMs > this.config.billing.entitlementCacheTtlSeconds * 1_000
    ) {
      await this.cache.invalidate(guildId, 'billing:entitlements');
      snapshot = await this.cache.getOrLoad(
        guildId,
        'billing:entitlements',
        EntitlementSnapshotSchema,
        load,
      );
    }
    if (snapshot.version !== guild.billingEntitlementVersion) {
      return [];
    }
    return snapshot.entitlements;
  }

  public async getGuildPlan(
    guildId: string,
    at = new Date(),
  ): Promise<{
    code: string;
    displayName: string;
    featureSetVersion: number;
    status: string;
  } | null> {
    DiscordSnowflakeSchema.parse(guildId);
    const subscription = await this.prisma.guildSubscription.findFirst({
      where: {
        guildId,
        status: { in: ['ACTIVE', 'GRACE_PERIOD', 'CANCELLED'] },
        OR: [{ currentPeriodEnd: { gt: at } }, { gracePeriodEndsAt: { gt: at } }],
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        planCode: true,
        planDisplayNameSnapshot: true,
        featureSetVersion: true,
        status: true,
      },
    });
    return subscription === null
      ? null
      : {
          code: subscription.planCode,
          displayName: subscription.planDisplayNameSnapshot,
          featureSetVersion: subscription.featureSetVersion,
          status: subscription.status,
        };
  }

  public async getGuildPremiumStatus(
    guildId: string,
    at = new Date(),
  ): Promise<GuildBillingStatus> {
    DiscordSnowflakeSchema.parse(guildId);
    const [subscription, premiumActive] = await Promise.all([
      this.prisma.guildSubscription.findFirst({
        where: {
          guildId,
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
        orderBy: { updatedAt: 'desc' },
      }),
      this.hasGuildEntitlement(guildId, PremiumEntitlement.Base, at),
    ]);
    return {
      guildId,
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

  public async invalidateGuildEntitlements(
    guildId: string,
    version: number,
    subscriptionId?: string,
  ): Promise<void> {
    if (this.cache === undefined) return;
    await this.cache.publish({
      type: 'guild.entitlements.updated',
      guildId: DiscordSnowflakeSchema.parse(guildId),
      version: z.number().int().positive().parse(version),
      timestamp: new Date().toISOString(),
      ...(subscriptionId === undefined ? {} : { subscriptionId: z.uuid().parse(subscriptionId) }),
    });
  }

  private async loadDatabaseSnapshot(
    guildId: string,
    at: Date,
  ): Promise<EntitlementSnapshot | null> {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
      select: { billingEntitlementVersion: true },
    });
    if (guild === null) return null;
    const records = await this.prisma.guildEntitlement.findMany({
      where: {
        guildId,
        status: 'ACTIVE',
        startsAt: { lte: at },
        OR: [{ endsAt: null }, { endsAt: { gt: at } }],
      },
      orderBy: { entitlementKey: 'asc' },
      select: {
        entitlementKey: true,
        source: true,
        subscriptionId: true,
        startsAt: true,
        endsAt: true,
      },
    });
    const nextBoundary = records.reduce<Date | null>((current, record) => {
      if (record.endsAt === null) return current;
      return current === null || record.endsAt < current ? record.endsAt : current;
    }, null);
    return EntitlementSnapshotSchema.parse({
      version: guild.billingEntitlementVersion,
      cachedAt: new Date().toISOString(),
      nextBoundaryAt: nextBoundary?.toISOString() ?? null,
      entitlements: records.map((record) => ({
        key: record.entitlementKey,
        source: record.source,
        subscriptionId: record.subscriptionId,
        startsAt: record.startsAt.toISOString(),
        endsAt: record.endsAt?.toISOString() ?? null,
      })),
    });
  }
}

export const isPremiumEntitlementKey = (value: string): value is PremiumEntitlementKey =>
  Object.values(PremiumEntitlement).some((key) => key === value);
