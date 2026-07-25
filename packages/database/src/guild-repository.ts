import {
  ConflictError,
  NotFoundError,
  type GuildModuleInput,
  type GuildSettingsInput,
} from '@sufbot/shared';
import { appendAuditLog, sanitizeAuditValue } from './audit.js';
import type { PrismaClient } from './generated/prisma/client.js';

export type ActorContext = {
  userId?: string;
  discordUserId: string;
  requestId: string;
  ipAddressHash?: string;
  userAgent?: string;
};

export class GuildRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async getSettings(guildId: string) {
    return this.prisma.guildSettings.findUnique({ where: { guildId } });
  }

  public async listModules(guildId: string) {
    return this.prisma.guildModule.findMany({
      where: { guildId },
      orderBy: { moduleKey: 'asc' },
    });
  }

  public async updateSettings(guildId: string, input: GuildSettingsInput, actor: ActorContext) {
    return this.prisma.$transaction(async (transaction) => {
      const guild = await transaction.guild.findUnique({
        where: { id: guildId },
        select: { id: true },
      });
      if (guild === null) throw new NotFoundError('Guild');

      const current = await transaction.guildSettings.upsert({
        where: { guildId },
        create: { guildId },
        update: {},
      });
      if (input.expectedVersion !== undefined && input.expectedVersion !== current.version) {
        throw new ConflictError('Guild settings were changed by another request.');
      }
      const updated = await transaction.guildSettings.update({
        where: { guildId, version: current.version },
        data: {
          ...(input.locale === undefined ? {} : { locale: input.locale }),
          ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
          ...(input.commandPrefix === undefined ? {} : { commandPrefix: input.commandPrefix }),
          version: { increment: 1 },
        },
      });
      await appendAuditLog(transaction, {
        guildId,
        ...(actor.userId === undefined ? {} : { actorUserId: actor.userId }),
        actorDiscordId: actor.discordUserId,
        action: 'guild.settings.updated',
        resourceType: 'GuildSettings',
        resourceId: guildId,
        previousValue: current,
        newValue: updated,
        requestId: actor.requestId,
        outcome: 'SUCCESS',
        ...(actor.ipAddressHash === undefined ? {} : { ipAddressHash: actor.ipAddressHash }),
        ...(actor.userAgent === undefined ? {} : { userAgent: actor.userAgent }),
      });
      return updated;
    });
  }

  public async updateModule(
    guildId: string,
    moduleKey: string,
    input: GuildModuleInput,
    actor: ActorContext,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const guild = await transaction.guild.findUnique({
        where: { id: guildId },
        select: { id: true },
      });
      if (guild === null) throw new NotFoundError('Guild');

      const current = await transaction.guildModule.findUnique({
        where: { guildId_moduleKey: { guildId, moduleKey } },
      });
      if (
        input.expectedVersion !== undefined &&
        current !== null &&
        input.expectedVersion !== current.version
      ) {
        throw new ConflictError('Module settings were changed by another request.');
      }
      const updated = await transaction.guildModule.upsert({
        where: { guildId_moduleKey: { guildId, moduleKey } },
        create: {
          guildId,
          moduleKey,
          enabled: input.enabled,
          config: sanitizeAuditValue(input.config),
        },
        update: {
          enabled: input.enabled,
          config: sanitizeAuditValue(input.config),
          version: { increment: 1 },
        },
      });
      await appendAuditLog(transaction, {
        guildId,
        ...(actor.userId === undefined ? {} : { actorUserId: actor.userId }),
        actorDiscordId: actor.discordUserId,
        action: input.enabled ? 'guild.module.enabled' : 'guild.module.disabled',
        resourceType: 'GuildModule',
        resourceId: moduleKey,
        previousValue: current,
        newValue: updated,
        requestId: actor.requestId,
        outcome: 'SUCCESS',
        ...(actor.ipAddressHash === undefined ? {} : { ipAddressHash: actor.ipAddressHash }),
        ...(actor.userAgent === undefined ? {} : { userAgent: actor.userAgent }),
      });
      return updated;
    });
  }
}
