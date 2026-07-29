'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  AutoRoleConfigSchema,
  GoodbyeConfigSchema,
  OnboardingDiscordResourcesSchema,
  OnboardingRepository,
  VerificationSetupRequestSchema,
  WelcomeCardConfigSchema,
  WelcomeConfigSchema,
  validateAutoRoleResources,
  validateGoodbyeResources,
  validateWelcomeResources,
} from '@sufbot/onboarding';
import type { OnboardingMessage } from '@sufbot/onboarding';
import { AuthorizationError, ValidationError, createId, isAppError } from '@sufbot/shared';
import type { ActionState } from './guild';
import { requireLiveGuildAccess } from '@/lib/discord';
import { cache, ensureCacheConnection, entitlements, onboardingQueue, prisma } from '@/lib/runtime';
import { validateMutationOrigin } from '@/lib/server-security';
import { requireDashboardSession } from '@/lib/session';

const GuildIdSchema = z.string().regex(/^\d{17,20}$/);
const IdempotencyKeySchema = z.string().regex(/^mut_[a-f0-9]{32}$/);
const OptionalGuildResourceIdSchema = z
  .union([GuildIdSchema, z.literal('')])
  .transform((value) => (value === '' ? null : value));
const MessageModeSchema = z.enum(['TEXT', 'EMBED', 'TEXT_AND_EMBED']);
const UnknownVariablePolicySchema = z.enum(['PRESERVE', 'EMPTY']);
const DeliverySchema = z.enum(['ON_JOIN', 'AFTER_VERIFICATION', 'BOTH']);
const RoleIdListSchema = z.array(GuildIdSchema).max(25);

const parseMessageFormData = (
  formData: FormData,
  fieldPrefix: 'message' | 'dmMessage',
  current: OnboardingMessage,
): OnboardingMessage => {
  const mode = formData.get(`${fieldPrefix}Mode`);
  const content = formData.get(`${fieldPrefix}Content`);
  const embed = formData.get(`${fieldPrefix}Embed`);
  const mentionUser = formData.get(`${fieldPrefix}MentionUser`);
  const unknownVariablePolicy = formData.get(`${fieldPrefix}UnknownVariablePolicy`);
  const deleteAfterSeconds = formData.get(`${fieldPrefix}DeleteAfterSeconds`);
  return {
    ...current,
    mode: mode === null ? current.mode : MessageModeSchema.parse(mode),
    content: content === null ? current.content : String(content),
    embed:
      typeof embed === 'string' && embed !== ''
        ? (JSON.parse(embed) as OnboardingMessage['embed'])
        : current.embed,
    allowedMentions: {
      ...current.allowedMentions,
      mentionUser: mentionUser === null ? current.allowedMentions.mentionUser : mentionUser === 'true',
    },
    unknownVariablePolicy:
      unknownVariablePolicy === null
        ? current.unknownVariablePolicy
        : UnknownVariablePolicySchema.parse(unknownVariablePolicy),
    deleteAfterSeconds:
      deleteAfterSeconds === null ? current.deleteAfterSeconds : Number(deleteAfterSeconds),
  };
};

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

const loadOnboardingResources = async (guildId: string) => {
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
  return resources;
};

const requireValidResources = async (
  guildId: string,
  validator: (
    resources: z.infer<typeof OnboardingDiscordResourcesSchema>,
  ) => readonly { message: string }[],
): Promise<void> => {
  const resources = await loadOnboardingResources(guildId);
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
    const updated = await new OnboardingRepository(prisma, cache, (guildId) =>
      entitlements.getGuildLimits(guildId),
    ).updateBasics(
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
    const repository = new OnboardingRepository(prisma, cache, (guildId) =>
      entitlements.getGuildLimits(guildId),
    );
    const current = await repository.get(context.guildId);
    const config = WelcomeConfigSchema.parse({
      ...current.welcome,
      channelId: OptionalGuildResourceIdSchema.parse(formData.get('channelId')),
      delivery: DeliverySchema.parse(formData.get('delivery')),
      delaySeconds: Number(formData.get('delaySeconds')),
      ignoreBots: formData.get('ignoreBots') === 'on',
      minimumAccountAgeHours: Number(formData.get('minimumAccountAgeHours')),
      attachWelcomeCard: formData.get('attachWelcomeCard') === 'on',
      message: parseMessageFormData(formData, 'message', current.welcome.message),
      dmEnabled: formData.get('dmEnabled') === 'on',
      dmDelivery: DeliverySchema.parse(formData.get('dmDelivery')),
      dmDelaySeconds: Number(formData.get('dmDelaySeconds')),
      dmMessage: parseMessageFormData(formData, 'dmMessage', current.welcome.dmMessage),
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
    const repository = new OnboardingRepository(prisma, cache, (guildId) =>
      entitlements.getGuildLimits(guildId),
    );
    const current = await repository.get(context.guildId);
    const config = GoodbyeConfigSchema.parse({
      ...current.goodbye,
      channelId: OptionalGuildResourceIdSchema.parse(formData.get('channelId')),
      delaySeconds: Number(formData.get('delaySeconds')),
      ignoreBots: formData.get('ignoreBots') === 'on',
      includeJoinDuration: formData.get('includeJoinDuration') === 'on',
      includeLastKnownRoles: formData.get('includeLastKnownRoles') === 'on',
      message: parseMessageFormData(formData, 'message', current.goodbye.message),
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
    const repository = new OnboardingRepository(prisma, cache, (guildId) =>
      entitlements.getGuildLimits(guildId),
    );
    const current = await repository.get(context.guildId);
    const config = AutoRoleConfigSchema.parse({
      ...current.autoRole,
      joinHumanRoleIds: RoleIdListSchema.parse(formData.getAll('joinHumanRoleIds').map(String)),
      joinBotRoleIds: RoleIdListSchema.parse(formData.getAll('joinBotRoleIds').map(String)),
      verifiedRoleIds: RoleIdListSchema.parse(formData.getAll('verifiedRoleIds').map(String)),
      screeningCompleteRoleIds: RoleIdListSchema.parse(
        formData.getAll('screeningCompleteRoleIds').map(String),
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

export const updateWelcomeCardConfigAction = async (
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> =>
  safeAction(async () => {
    const context = await prepareMutation(formData);
    const repository = new OnboardingRepository(prisma, cache, (guildId) =>
      entitlements.getGuildLimits(guildId),
    );
    const current = await repository.get(context.guildId);
    const parseColor = (name: string): number =>
      Number.parseInt(String(formData.get(name) ?? '').replace(/^#/u, ''), 16);
    const config = WelcomeCardConfigSchema.parse({
      ...current.welcomeCard,
      width: Number(formData.get('width')),
      height: Number(formData.get('height')),
      backgroundUrl: String(formData.get('backgroundUrl') ?? ''),
      backgroundFit: formData.get('backgroundFit'),
      backgroundPosition: formData.get('backgroundPosition'),
      overlayOpacity: Number(formData.get('overlayOpacity')),
      textColor: parseColor('textColor'),
      accentColor: parseColor('accentColor'),
      avatarSize: Number(formData.get('avatarSize')),
      avatarBorderWidth: Number(formData.get('avatarBorderWidth')),
      avatarBorderColor: parseColor('avatarBorderColor'),
      avatarShape: formData.get('avatarShape'),
      textAlignment: formData.get('textAlignment'),
      font: formData.get('font'),
      titleTemplate: formData.get('titleTemplate'),
      subtitleTemplate: formData.get('subtitleTemplate'),
      bodyTemplate: formData.get('bodyTemplate'),
      memberCountTemplate: formData.get('memberCountTemplate'),
      showServerIcon: formData.get('showServerIcon') === 'on',
      format: formData.get('format'),
      quality: Number(formData.get('quality')),
    });
    const updated = await repository.updateWelcomeCard(
      { expectedVersion: Number(formData.get('expectedVersion')), config },
      context.guildId,
      context.actor,
    );
    revalidatePath(`/dashboard/guilds/${context.guildId}/onboarding/welcome-card`);
    return `Welcome card configuration saved at version ${updated.version}.`;
  });

export const setupVerificationAction = async (
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> =>
  safeAction(async () => {
    const context = await prepareMutation(formData);
    const repository = new OnboardingRepository(prisma, cache, (guildId) =>
      entitlements.getGuildLimits(guildId),
    );
    const operation = z
      .enum(['SETUP', 'REPAIR', 'RESEND', 'DRY_RUN'])
      .parse(formData.get('operation'));
    const mode = z
      .enum(['EVERYONE_VISIBLE', 'DEDICATED_UNVERIFIED_ROLE'])
      .parse(formData.get('mode'));
    const memberIds = String(formData.get('memberIds') ?? '')
      .split(/[\s,]+/u)
      .map((memberId) => memberId.trim())
      .filter(Boolean);
    const parseColor = (value: FormDataEntryValue | null): number => {
      const text = String(value ?? '').replace(/^#/u, '');
      return Number.parseInt(text, 16);
    };
    const request = VerificationSetupRequestSchema.parse({
      expectedVersion: Number(formData.get('expectedVersion')),
      operation,
      mode,
      channel: {
        strategy: formData.get('channelStrategy'),
        channelId: OptionalGuildResourceIdSchema.parse(formData.get('channelId')),
        name: formData.get('channelName'),
        categoryId: OptionalGuildResourceIdSchema.parse(formData.get('categoryId')),
      },
      verifiedRole: {
        strategy: formData.get('verifiedRoleStrategy'),
        roleId: OptionalGuildResourceIdSchema.parse(formData.get('verifiedRoleId')),
        name: formData.get('verifiedRoleName'),
        color: parseColor(formData.get('verifiedRoleColor')),
        hoist: formData.get('verifiedRoleHoist') === 'on',
        mentionable: formData.get('verifiedRoleMentionable') === 'on',
      },
      unverifiedRole:
        mode === 'DEDICATED_UNVERIFIED_ROLE'
          ? {
              strategy: formData.get('unverifiedRoleStrategy'),
              roleId: OptionalGuildResourceIdSchema.parse(formData.get('unverifiedRoleId')),
              name: formData.get('unverifiedRoleName'),
              color: parseColor(formData.get('unverifiedRoleColor')),
              hoist: formData.get('unverifiedRoleHoist') === 'on',
              mentionable: formData.get('unverifiedRoleMentionable') === 'on',
            }
          : null,
      restrictedChannelIds: formData.getAll('restrictedChannelIds').map(String),
      migration: {
        mode: formData.get('migrationMode'),
        memberIds,
        maxCount: Number(formData.get('migrationMaxCount')),
      },
      confirmed: formData.get('confirmed') === 'on',
    });
    const resources = await loadOnboardingResources(context.guildId);
    if (
      (request.channel.strategy === 'CREATE' || request.restrictedChannelIds.length > 0) &&
      !resources.bot.canManageChannels
    ) {
      throw new ValidationError('The bot needs Manage Channels for this setup.');
    }
    if (
      (request.verifiedRole.strategy === 'CREATE' ||
        request.unverifiedRole?.strategy === 'CREATE') &&
      !resources.bot.canManageRoles
    ) {
      throw new ValidationError('The bot needs Manage Roles for this setup.');
    }
    if (
      request.channel.strategy === 'EXISTING' &&
      !resources.channels.some(
        (channel) =>
          channel.id === request.channel.channelId && channel.type === 'TEXT' && channel.canManage,
      )
    ) {
      throw new ValidationError('The selected verification channel is not manageable.');
    }
    for (const selection of [request.verifiedRole, request.unverifiedRole]) {
      if (selection === null || selection.strategy === 'CREATE') continue;
      if (!resources.roles.some((role) => role.id === selection.roleId && role.assignable)) {
        throw new ValidationError('A selected verification role is not assignable.');
      }
    }
    const pending =
      request.operation === 'DRY_RUN'
        ? await repository.get(context.guildId)
        : await repository.beginVerificationSetup(request, context.guildId, context.actor);
    try {
      await onboardingQueue.enqueueOnboarding({
        job: 'onboarding.verification-setup',
        idempotencyKey: `verification-setup:${context.guildId}:${context.actor.requestId}`,
        correlationId: context.actor.requestId,
        guildId: context.guildId,
        userId: context.actor.actorDiscordId,
        deliverAt: new Date().toISOString(),
        pendingVersion: pending.version,
        request,
      });
    } catch (error) {
      if (request.operation !== 'DRY_RUN') {
        await repository.failVerificationSetup(
          context.guildId,
          pending.version,
          context.actor,
          'The verification setup job could not be queued.',
          false,
        );
      }
      throw error;
    }
    revalidatePath(`/dashboard/guilds/${context.guildId}/onboarding/verification`);
    return request.operation === 'DRY_RUN'
      ? `Dry-run queued. Reference: ${context.actor.requestId}`
      : `Verification setup queued at version ${pending.version}.`;
  });
