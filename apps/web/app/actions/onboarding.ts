'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { OnboardingRepository } from '@sufbot/onboarding';
import { AuthorizationError, createId, isAppError } from '@sufbot/shared';
import type { ActionState } from './guild';
import { requireLiveGuildAccess } from '@/lib/discord';
import { cache, ensureCacheConnection, prisma } from '@/lib/runtime';
import { validateMutationOrigin } from '@/lib/server-security';
import { requireDashboardSession } from '@/lib/session';

const GuildIdSchema = z.string().regex(/^\d{17,20}$/);
const IdempotencyKeySchema = z.string().regex(/^mut_[a-f0-9]{32}$/);

const safeAction = async (operation: () => Promise<string>): Promise<ActionState> => {
  try {
    return { status: 'success', message: await operation() };
  } catch (error) {
    return {
      status: 'error',
      message:
        isAppError(error) && error.expose && error.message.length <= 180
          ? error.message
          : 'The onboarding change could not be saved.',
    };
  }
};

export const updateOnboardingBasicsAction = async (
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> =>
  safeAction(async () => {
    await validateMutationOrigin();
    const session = await requireDashboardSession();
    const guildId = GuildIdSchema.parse(formData.get('guildId'));
    const idempotencyKey = IdempotencyKeySchema.parse(formData.get('idempotencyKey'));
    const access = await requireLiveGuildAccess(session.user.id, guildId);
    await ensureCacheConnection();
    const claimed = await cache.claimOnce('dashboard-mutation', idempotencyKey, 600);
    if (!claimed) {
      throw new AuthorizationError('Duplicate submission rejected.', 'DUPLICATE_SUBMISSION');
    }
    const requestHeaders = await headers();
    const userAgent = requestHeaders.get('user-agent')?.slice(0, 255);
    const updated = await new OnboardingRepository(prisma, cache).updateBasics(
      {
        welcomeEnabled: formData.get('welcomeEnabled') === 'on',
        goodbyeEnabled: formData.get('goodbyeEnabled') === 'on',
        verificationEnabled: formData.get('verificationEnabled') === 'on',
        autoRoleEnabled: formData.get('autoRoleEnabled') === 'on',
        welcomeCardEnabled: formData.get('welcomeCardEnabled') === 'on',
        expectedVersion: Number(formData.get('expectedVersion')),
      },
      guildId,
      {
        actorUserId: session.user.id,
        actorDiscordId: access.discordUserId,
        requestId: requestHeaders.get('x-request-id') ?? createId('req'),
        source: 'dashboard',
        ...(userAgent === undefined ? {} : { userAgent }),
      },
    );
    revalidatePath(`/dashboard/guilds/${guildId}/onboarding`);
    return `Member Onboarding settings saved at version ${updated.version}.`;
  });
