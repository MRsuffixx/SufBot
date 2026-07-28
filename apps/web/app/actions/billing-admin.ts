'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  BillingManagementService,
  EntitlementService,
  entitlementsForFeatureSet,
} from '@sufbot/billing';
import { createId, isAppError } from '@sufbot/shared';
import { requireBillingAdmin } from '@/lib/billing-admin';
import { validateMutationOrigin } from '@/lib/server-security';
import {
  appConfig,
  billingProviders,
  cache,
  ensureCacheConnection,
  prisma,
} from '@/lib/runtime';
import type { ActionState } from './guild';

const MutationIdSchema = z.string().regex(/^mut_[a-f0-9]{32}$/);
const GuildIdSchema = z.string().regex(/^\d{17,20}$/);
const ReasonSchema = z.string().trim().min(10).max(500);

const safeAdminAction = async (
  operation: () => Promise<string>,
): Promise<ActionState> => {
  try {
    return { status: 'success', message: await operation() };
  } catch (error) {
    return {
      status: 'error',
      message:
        isAppError(error) && error.expose
          ? error.message
          : 'The billing administration action failed.',
    };
  }
};

const authorizeMutation = async (formData: FormData) => {
  await validateMutationOrigin();
  const actor = await requireBillingAdmin();
  const idempotencyKey = MutationIdSchema.parse(formData.get('idempotencyKey'));
  const reason = ReasonSchema.parse(formData.get('reason'));
  if (formData.get('confirmation') !== 'CONFIRM') {
    throw new Error('Explicit confirmation is required.');
  }
  await ensureCacheConnection();
  const claimed = await cache.claimOnce('billing-admin-mutation', idempotencyKey, 86_400);
  if (!claimed) throw new Error('Duplicate billing administration action rejected.');
  return { actor, idempotencyKey, reason };
};

export const adminReconcileBillingAction = async (
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> =>
  safeAdminAction(async () => {
    const { actor, idempotencyKey, reason } = await authorizeMutation(formData);
    const subscriptionId = z.uuid().parse(formData.get('subscriptionId'));
    const management = new BillingManagementService(
      prisma,
      appConfig,
      billingProviders,
      cache,
    );
    const result = await management.reconcileAsSystem({
      subscriptionId,
      requestId: createId('req'),
    });
    await prisma.billingAuditEvent.create({
      data: {
        actorType: 'STAFF',
        actorUserId: actor.session.user.id,
        guildId: result.guildId,
        subscriptionId,
        action: 'billing.admin.reconciled',
        requestId: idempotencyKey,
        source: 'admin',
        metadata: { reason },
      },
    });
    revalidatePath('/dashboard/billing-admin');
    return 'Provider state was retrieved and reconciled.';
  });

export const adminAddPromotionAction = async (
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> =>
  safeAdminAction(async () => {
    const { actor, idempotencyKey, reason } = await authorizeMutation(formData);
    const guildId = GuildIdSchema.parse(formData.get('guildId'));
    const endsAt = z.coerce.date().parse(formData.get('endsAt'));
    const now = new Date();
    if (endsAt <= now || endsAt > new Date(now.getTime() + 366 * 86_400_000)) {
      throw new Error('Promotion expiry must be within the next 366 days.');
    }
    const sourceReference = `promo_${idempotencyKey.slice(4)}`;
    const entitlementKeys = entitlementsForFeatureSet(
      appConfig.billing.plan.featureSetVersion,
    );
    const version = await prisma.$transaction(async (transaction) => {
      for (const entitlementKey of entitlementKeys) {
        await transaction.guildEntitlement.upsert({
          where: {
            guildId_entitlementKey_source_sourceReference: {
              guildId,
              entitlementKey,
              source: 'MANUAL_PROMOTION',
              sourceReference,
            },
          },
          create: {
            guildId,
            entitlementKey,
            source: 'MANUAL_PROMOTION',
            sourceReference,
            startsAt: now,
            endsAt,
            metadata: { reason, grantedBy: actor.discordUserId },
          },
          update: { status: 'ACTIVE', startsAt: now, endsAt },
        });
      }
      const guild = await transaction.guild.update({
        where: { id: guildId },
        data: { billingEntitlementVersion: { increment: 1 } },
        select: { billingEntitlementVersion: true },
      });
      await transaction.billingAuditEvent.create({
        data: {
          actorType: 'STAFF',
          actorUserId: actor.session.user.id,
          guildId,
          action: 'billing.admin.promotion-granted',
          requestId: idempotencyKey,
          source: 'admin',
          newValue: { sourceReference, endsAt, entitlementKeys },
          metadata: { reason },
        },
      });
      return guild.billingEntitlementVersion;
    });
    await new EntitlementService(prisma, appConfig, cache).invalidateGuildEntitlements(
      guildId,
      version,
    );
    revalidatePath('/dashboard/billing-admin');
    return `Manual promotion ${sourceReference} was granted with an explicit expiry.`;
  });

export const adminRevokePromotionAction = async (
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> =>
  safeAdminAction(async () => {
    const { actor, idempotencyKey, reason } = await authorizeMutation(formData);
    const guildId = GuildIdSchema.parse(formData.get('guildId'));
    const sourceReference = z
      .string()
      .regex(/^promo_[a-f0-9]{32}$/)
      .parse(formData.get('sourceReference'));
    const now = new Date();
    const result = await prisma.$transaction(async (transaction) => {
      const changed = await transaction.guildEntitlement.updateMany({
        where: {
          guildId,
          source: 'MANUAL_PROMOTION',
          sourceReference,
          status: 'ACTIVE',
        },
        data: { status: 'REVOKED', endsAt: now },
      });
      if (changed.count === 0) throw new Error('Active promotion was not found.');
      const guild = await transaction.guild.update({
        where: { id: guildId },
        data: { billingEntitlementVersion: { increment: 1 } },
        select: { billingEntitlementVersion: true },
      });
      await transaction.billingAuditEvent.create({
        data: {
          actorType: 'STAFF',
          actorUserId: actor.session.user.id,
          guildId,
          action: 'billing.admin.promotion-revoked',
          requestId: idempotencyKey,
          source: 'admin',
          previousValue: { sourceReference },
          metadata: { reason },
        },
      });
      return guild.billingEntitlementVersion;
    });
    await new EntitlementService(prisma, appConfig, cache).invalidateGuildEntitlements(
      guildId,
      result,
    );
    revalidatePath('/dashboard/billing-admin');
    return 'Manual promotion was revoked.';
  });
