'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  GuildModuleInputSchema,
  GuildSettingsInputSchema,
  AuthorizationError,
  createId,
  isAppError,
} from '@sufbot/shared';
import { appendAuditLog, GuildRepository } from '@sufbot/database';
import { builtInModules, commandMetadata } from '@sufbot/discord';
import { requireDashboardSession } from '@/lib/session';
import { requireLiveGuildAccess } from '@/lib/discord';
import { cache, ensureCacheConnection, prisma } from '@/lib/runtime';
import { validateMutationOrigin } from '@/lib/server-security';

export type ActionState = {
  status: 'idle' | 'success' | 'error';
  message: string;
};

const IdempotencyKeySchema = z.string().regex(/^mut_[a-f0-9]{32}$/);
const GuildIdSchema = z.string().regex(/^\d{17,20}$/);
const allowedModuleKeys = new Set(builtInModules.map((module) => module.metadata.key));

const claimMutation = async (formData: FormData): Promise<string> => {
  const idempotencyKey = IdempotencyKeySchema.parse(formData.get('idempotencyKey'));
  await ensureCacheConnection();
  const claimed = await cache.claimOnce('dashboard-mutation', idempotencyKey, 600);
  if (!claimed)
    throw new AuthorizationError('Duplicate submission rejected.', 'DUPLICATE_SUBMISSION');
  return idempotencyKey;
};

const actorMetadata = async () => {
  const requestHeaders = await headers();
  return {
    userAgent: requestHeaders.get('user-agent')?.slice(0, 255),
    requestId: requestHeaders.get('x-request-id') ?? createId('req'),
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
          : 'The change could not be saved.',
    };
  }
};

export const updateGuildSettingsAction = async (
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> =>
  safeAction(async () => {
    await validateMutationOrigin();
    await claimMutation(formData);
    const session = await requireDashboardSession();
    const guildId = GuildIdSchema.parse(formData.get('guildId'));
    const access = await requireLiveGuildAccess(session.user.id, guildId);
    const metadata = await actorMetadata();
    const input = GuildSettingsInputSchema.parse({
      locale: formData.get('locale'),
      timezone: formData.get('timezone'),
      commandPrefix: formData.get('commandPrefix'),
      expectedVersion: Number(formData.get('expectedVersion')),
    });
    const repository = new GuildRepository(prisma);
    const updated = await repository.updateSettings(guildId, input, {
      userId: session.user.id,
      discordUserId: access.discordUserId,
      requestId: metadata.requestId,
      ...(metadata.userAgent === undefined ? {} : { userAgent: metadata.userAgent }),
    });
    await ensureCacheConnection();
    await cache.publish({
      type: 'guild.config.updated',
      guildId,
      version: updated.version,
      timestamp: new Date().toISOString(),
    });
    revalidatePath(`/dashboard/guilds/${guildId}`);
    return 'Guild settings saved and published to bot processes.';
  });

export const updateGuildModuleAction = async (
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> =>
  safeAction(async () => {
    await validateMutationOrigin();
    await claimMutation(formData);
    const session = await requireDashboardSession();
    const guildId = GuildIdSchema.parse(formData.get('guildId'));
    const moduleKey = z.string().min(1).max(64).parse(formData.get('moduleKey'));
    if (!allowedModuleKeys.has(moduleKey)) throw new TypeError('Unknown module.');
    const access = await requireLiveGuildAccess(session.user.id, guildId);
    const input = GuildModuleInputSchema.parse({
      enabled: formData.get('enabled') === 'true',
      config: {},
      expectedVersion: Number(formData.get('expectedVersion')),
    });
    const metadata = await actorMetadata();
    const updated = await new GuildRepository(prisma).updateModule(guildId, moduleKey, input, {
      userId: session.user.id,
      discordUserId: access.discordUserId,
      requestId: metadata.requestId,
      ...(metadata.userAgent === undefined ? {} : { userAgent: metadata.userAgent }),
    });
    await ensureCacheConnection();
    await cache.publish({
      type: 'guild.config.updated',
      guildId,
      module: moduleKey,
      version: updated.version,
      timestamp: new Date().toISOString(),
    });
    revalidatePath(`/dashboard/guilds/${guildId}/modules`);
    return `${moduleKey} is now ${updated.enabled ? 'enabled' : 'disabled'}.`;
  });

export const updateCommandOverrideAction = async (
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> =>
  safeAction(async () => {
    await validateMutationOrigin();
    await claimMutation(formData);
    const session = await requireDashboardSession();
    const guildId = GuildIdSchema.parse(formData.get('guildId'));
    const commandName = z.string().min(1).max(64).parse(formData.get('commandName'));
    const roleId = GuildIdSchema.parse(formData.get('roleId'));
    const effect = z.enum(['allow', 'deny']).parse(formData.get('effect'));
    if (!commandMetadata.has(commandName)) throw new TypeError('Unknown command.');
    const access = await requireLiveGuildAccess(session.user.id, guildId);
    const metadata = await actorMetadata();
    const updated = await prisma.$transaction(async (transaction) => {
      const previous = await transaction.guildCommandOverride.findUnique({
        where: {
          guildId_commandName_subjectType_subjectId: {
            guildId,
            commandName,
            subjectType: 'ROLE',
            subjectId: roleId,
          },
        },
      });
      const record = await transaction.guildCommandOverride.upsert({
        where: {
          guildId_commandName_subjectType_subjectId: {
            guildId,
            commandName,
            subjectType: 'ROLE',
            subjectId: roleId,
          },
        },
        create: {
          guildId,
          commandName,
          subjectType: 'ROLE',
          subjectId: roleId,
          allow: effect === 'allow' ? ['execute'] : [],
          deny: effect === 'deny' ? ['execute'] : [],
        },
        update: {
          allow: effect === 'allow' ? ['execute'] : [],
          deny: effect === 'deny' ? ['execute'] : [],
        },
      });
      await appendAuditLog(transaction, {
        guildId,
        actorUserId: session.user.id,
        actorDiscordId: access.discordUserId,
        action: 'guild.command-permission.updated',
        resourceType: 'GuildCommandOverride',
        resourceId: record.id,
        previousValue: previous,
        newValue: record,
        requestId: metadata.requestId,
        outcome: 'SUCCESS',
        ...(metadata.userAgent === undefined ? {} : { userAgent: metadata.userAgent }),
      });
      return record;
    });
    await ensureCacheConnection();
    await cache.publish({
      type: 'guild.config.updated',
      guildId,
      version: Math.max(1, Math.floor(updated.updatedAt.getTime() / 1000)),
      timestamp: new Date().toISOString(),
    });
    revalidatePath(`/dashboard/guilds/${guildId}/commands`);
    return `The ${commandName} override was saved for role ${roleId}.`;
  });
