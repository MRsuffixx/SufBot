'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  AutoRoleConfigSchema,
  GoodbyeConfigSchema,
  OnboardingDiscordResourcesSchema,
  OnboardingRepository,
  WelcomeConfigSchema,
  validateAutoRoleResources,
  validateGoodbyeResources,
  validateWelcomeResources,
} from '@sufbot/onboarding';
import { AuthorizationError, ValidationError, createId, isAppError } from '@sufbot/shared';
import type { ActionState } from './guild';
import { requireLiveGuildAccess } from '@/lib/discord';
import { cache, ensureCacheConnection, prisma } from '@/lib/runtime';
import { validateMutationOrigin } from '@/lib/server-security';
import { requireDashboardSession } from '@/lib/session';

const GuildIdSchema = z.string().regex(/^\d{17,20}$/);
const IdempotencyKeySchema = z.string().regex(/^mut_[a-f0-9]{32}$/);
const OptionalGuildResourceIdSchema = z
  .union([GuildIdSchema, z.literal('')])
  .transform((value) => (value === '' ? null : value));
const MessageModeSchema = z.enum(['TEXT', 'EMBED', 'TEXT_AND_EMBED']);
const DeliverySchema = z.enum(['ON_JOIN', 'AFTER_VERIFICATION', 'BOTH']);
const RoleIdListSchema = z
  .string()
  .transform((value) =>
    value
      .split(/[\s,]+/u)
      .map((roleId) => roleId.trim())
      .filter(Boolean),
  )
  .pipe(z.array(GuildIdSchema).max(25));

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

const requireValidResources = async (
  guildId: string,
  validator: (
    resources: z.infer<typeof OnboardingDiscordResourcesSchema>,
  ) => readonly { message: string }[],
): Promise<void> => {
  const resources = await cache.readRuntimeState(
    'bot:onboarding-resources',
    guildId,
    OnboardingDiscordResourcesSchema,
  );
  if (resources === null) {
    throw new ValidationError(
      'Live Discord channels and roles are unavailable. Confirm the bot is online.',
    );
  }
  const issue = validator(resources)[0];
  if (issue !== undefined) throw new ValidationError(issue.message);
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

const prepareMutation = async (formData: FormData) => {
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
  return {
    session,
    guildId,
    requestHeaders,
    actor: {
      actorUserId: session.user.id,
      actorDiscordId: access.discordUserId,
      requestId: requestHeaders.get('x-request-id') ?? createId('req'),
      source: 'dashboard' as const,
      ...(userAgent === undefined ? {} : { userAgent }),
    },
  };
};

export const updateWelcomeConfigAction = async (
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> =>
  safeAction(async () => {
    const context = await prepareMutation(formData);
    const repository = new OnboardingRepository(prisma, cache);
    const current = await repository.get(context.guildId);
    const config = WelcomeConfigSchema.parse({
      ...current.welcome,
      channelId: OptionalGuildResourceIdSchema.parse(formData.get('channelId')),
      delivery: DeliverySchema.parse(formData.get('delivery')),
      delaySeconds: Number(formData.get('delaySeconds')),
      ignoreBots: formData.get('ignoreBots') === 'on',
      minimumAccountAgeHours: Number(formData.get('minimumAccountAgeHours')),
      attachWelcomeCard: formData.get('attachWelcomeCard') === 'on',
      message: {
        ...current.welcome.message,
        mode: MessageModeSchema.parse(formData.get('messageMode')),
        content: String(formData.get('messageContent') ?? ''),
      },
      dmEnabled: formData.get('dmEnabled') === 'on',
      dmDelivery: DeliverySchema.parse(formData.get('dmDelivery')),
      dmDelaySeconds: Number(formData.get('dmDelaySeconds')),
      dmMessage: {
        ...current.welcome.dmMessage,
        mode: MessageModeSchema.parse(formData.get('dmMessageMode')),
        content: String(formData.get('dmMessageContent') ?? ''),
      },
    });
    await requireValidResources(context.guildId, (resources) =>
      validateWelcomeResources(config, resources),
    );
    const updated = await repository.updateWelcome(
      {
        expectedVersion: Number(formData.get('expectedVersion')),
        config,
      },
      context.guildId,
      context.actor,
    );
    revalidatePath(`/dashboard/guilds/${context.guildId}/onboarding/welcome`);
    return `Welcome configuration saved at version ${updated.version}.`;
  });

export const updateGoodbyeConfigAction = async (
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> =>
  safeAction(async () => {
    const context = await prepareMutation(formData);
    const repository = new OnboardingRepository(prisma, cache);
    const current = await repository.get(context.guildId);
    const config = GoodbyeConfigSchema.parse({
      ...current.goodbye,
      channelId: OptionalGuildResourceIdSchema.parse(formData.get('channelId')),
      delaySeconds: Number(formData.get('delaySeconds')),
      ignoreBots: formData.get('ignoreBots') === 'on',
      includeJoinDuration: formData.get('includeJoinDuration') === 'on',
      includeLastKnownRoles: formData.get('includeLastKnownRoles') === 'on',
      message: {
        ...current.goodbye.message,
        mode: MessageModeSchema.parse(formData.get('messageMode')),
        content: String(formData.get('messageContent') ?? ''),
      },
    });
    await requireValidResources(context.guildId, (resources) =>
      validateGoodbyeResources(config, resources),
    );
    const updated = await repository.updateGoodbye(
      {
        expectedVersion: Number(formData.get('expectedVersion')),
        config,
      },
      context.guildId,
      context.actor,
    );
    revalidatePath(`/dashboard/guilds/${context.guildId}/onboarding/goodbye`);
    return `Goodbye configuration saved at version ${updated.version}.`;
  });

export const updateAutoRoleConfigAction = async (
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> =>
  safeAction(async () => {
    const context = await prepareMutation(formData);
    const repository = new OnboardingRepository(prisma, cache);
    const current = await repository.get(context.guildId);
    const config = AutoRoleConfigSchema.parse({
      ...current.autoRole,
      joinHumanRoleIds: RoleIdListSchema.parse(String(formData.get('joinHumanRoleIds') ?? '')),
      joinBotRoleIds: RoleIdListSchema.parse(String(formData.get('joinBotRoleIds') ?? '')),
      verifiedRoleIds: RoleIdListSchema.parse(String(formData.get('verifiedRoleIds') ?? '')),
      screeningCompleteRoleIds: RoleIdListSchema.parse(
        String(formData.get('screeningCompleteRoleIds') ?? ''),
      ),
      joinDelaySeconds: Number(formData.get('joinDelaySeconds')),
      verifiedDelaySeconds: Number(formData.get('verifiedDelaySeconds')),
      continueOnError: formData.get('continueOnError') === 'on',
      retryFailedAssignments: formData.get('retryFailedAssignments') === 'on',
    });
    await requireValidResources(context.guildId, (resources) =>
      validateAutoRoleResources(config, resources),
    );
    const updated = await repository.updateRoles(
      {
        expectedVersion: Number(formData.get('expectedVersion')),
        config,
      },
      context.guildId,
      context.actor,
    );
    revalidatePath(`/dashboard/guilds/${context.guildId}/onboarding/roles`);
    return `Automatic role configuration saved at version ${updated.version}.`;
  });
