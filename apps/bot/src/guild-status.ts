import { z } from 'zod';
import {
  ChannelType,
  PermissionFlagsBits,
  type Client,
  type Guild,
  type GuildBasedChannel,
} from 'discord.js';
import { appendAuditLog } from '@sufbot/database';
import {
  BotGuildRuntimeStatusSchema,
  evaluateBotPermissionDiagnostics,
  type BotGuildRuntimeStatus,
} from '@sufbot/discord';
import { OnboardingDiscordResourcesSchema } from '@sufbot/onboarding';
import type { BotServices } from './services.js';

const GuildStatusRefreshSchema = z.object({
  guildId: z.string().regex(/^\d{17,20}$/),
  requestedAt: z.iso.datetime(),
});

const isMessageChannel = (channel: GuildBasedChannel): boolean =>
  channel.type === ChannelType.GuildText ||
  channel.type === ChannelType.GuildAnnouncement ||
  channel.type === ChannelType.GuildForum ||
  channel.type === ChannelType.GuildMedia;

export class GuildStatusService {
  readonly #knownGuildIds = new Set<string>();
  #timer: NodeJS.Timeout | undefined;
  #stopRefreshSubscription: (() => Promise<void>) | undefined;

  public constructor(
    private readonly client: Client<true>,
    private readonly services: BotServices,
  ) {}

  public async start(): Promise<void> {
    if (this.#timer !== undefined) return;
    this.#stopRefreshSubscription = await this.services.cache.subscribeRuntimeEvents(
      'bot:guild-status:refresh',
      GuildStatusRefreshSchema,
      async ({ guildId }) => {
        const guild = this.client.guilds.cache.get(guildId);
        if (guild !== undefined) await this.refreshGuild(guild, 'dashboard-refresh');
        else await this.removeGuild(guildId, 'dashboard-refresh-not-installed');
      },
    );
    await this.refreshAll('startup-reconciliation');
    this.#timer = setInterval(() => {
      void this.refreshAll('periodic-heartbeat');
    }, 15_000);
    this.#timer.unref();
  }

  public async close(): Promise<void> {
    if (this.#timer !== undefined) {
      clearInterval(this.#timer);
      this.#timer = undefined;
    }
    if (this.#stopRefreshSubscription !== undefined) {
      await this.#stopRefreshSubscription();
      this.#stopRefreshSubscription = undefined;
    }
    await Promise.allSettled(
      [...this.#knownGuildIds].flatMap((guildId) => [
        this.services.cache.deleteRuntimeState('bot:guild', guildId),
        this.services.cache.deleteRuntimeState('bot:onboarding-resources', guildId),
      ]),
    );
    this.#knownGuildIds.clear();
  }

  public async refreshAll(source: string): Promise<void> {
    const results = await Promise.allSettled(
      [...this.client.guilds.cache.values()].map((guild) => this.refreshGuild(guild, source)),
    );
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const guild = [...this.client.guilds.cache.values()][index];
        this.services.logger.warn(
          { err: result.reason, guildId: guild?.id, source },
          'guild runtime status refresh failed',
        );
      }
    });
  }

  public async refreshGuild(guild: Guild, source: string): Promise<BotGuildRuntimeStatus> {
    const botMember = guild.members.me ?? (await guild.members.fetchMe());
    const [moderationModule, settings] = await Promise.all([
      this.services.prisma.guildModule.findUnique({
        where: { guildId_moduleKey: { guildId: guild.id, moduleKey: 'moderation' } },
        select: { config: true },
      }),
      this.services.prisma.guildSettings.findUnique({
        where: { guildId: guild.id },
        select: { updatedAt: true, version: true },
      }),
    ]);
    const configuredChannelIds = this.configuredChannelIds(moderationModule?.config);
    const configuredChannels = await Promise.all(
      configuredChannelIds.map(async (channelId) => {
        const channel =
          guild.channels.cache.get(channelId) ??
          (await guild.channels.fetch(channelId).catch(() => null));
        if (channel === null || !isMessageChannel(channel)) {
          return { canView: false, canSend: false };
        }
        const permissions = channel.permissionsFor(botMember);
        return {
          canView: permissions?.has(PermissionFlagsBits.ViewChannel) === true,
          canSend: permissions?.has(PermissionFlagsBits.SendMessages) === true,
        };
      }),
    );
    const diagnostics = evaluateBotPermissionDiagnostics({
      permissionBitfield: botMember.permissions.bitfield,
      highestRolePosition: botMember.roles.highest.position,
      configuredChannels,
    });
    const now = new Date();
    const commandRegistration = this.services.commandRegistrationStatus;
    const status = BotGuildRuntimeStatusSchema.parse({
      version: 1,
      guildId: guild.id,
      botUserId: this.client.user.id,
      installed: true,
      online: true,
      permissionBitfield: botMember.permissions.bitfield.toString(),
      highestRolePosition: botMember.roles.highest.position,
      ...diagnostics,
      commandRegistration,
      guild: {
        name: guild.name,
        iconHash: guild.icon,
        ownerDiscordId: guild.ownerId,
        memberCount: guild.memberCount,
      },
      checkedAt: now.toISOString(),
      lastConfigurationSyncAt: settings?.updatedAt.toISOString() ?? null,
    });

    const wasInstalled = await this.services.prisma.$transaction(async (transaction) => {
      const previous = await transaction.guild.findUnique({
        where: { id: guild.id },
        select: { botInstalled: true, leftAt: true },
      });
      const transitioned = previous?.botInstalled !== true || previous.leftAt !== null;
      await transaction.guild.upsert({
        where: { id: guild.id },
        create: {
          id: guild.id,
          name: guild.name,
          iconHash: guild.icon,
          ownerDiscordId: guild.ownerId,
          botInstalled: true,
          botUserId: this.client.user.id,
          botPermissionBitfield: status.permissionBitfield,
          botHasAdministrator: status.administrator,
          botHighestRolePosition: status.highestRolePosition,
          botStatusUpdatedAt: now,
          botLastSeenAt: now,
          commandRegistrationMode: commandRegistration.mode,
          commandRegistrationStatus: commandRegistration.status,
          registeredCommandCount: commandRegistration.registeredCount,
          ...(commandRegistration.schemaHash === undefined
            ? {}
            : { commandSchemaHash: commandRegistration.schemaHash }),
          commandRegistrationUpdatedAt:
            commandRegistration.updatedAt === undefined
              ? null
              : new Date(commandRegistration.updatedAt),
          joinedAt: now,
        },
        update: {
          name: guild.name,
          iconHash: guild.icon,
          ownerDiscordId: guild.ownerId,
          botInstalled: true,
          botUserId: this.client.user.id,
          botPermissionBitfield: status.permissionBitfield,
          botHasAdministrator: status.administrator,
          botHighestRolePosition: status.highestRolePosition,
          botStatusUpdatedAt: now,
          botLastSeenAt: now,
          commandRegistrationMode: commandRegistration.mode,
          commandRegistrationStatus: commandRegistration.status,
          registeredCommandCount: commandRegistration.registeredCount,
          ...(commandRegistration.schemaHash === undefined
            ? {}
            : { commandSchemaHash: commandRegistration.schemaHash }),
          commandRegistrationUpdatedAt:
            commandRegistration.updatedAt === undefined
              ? null
              : new Date(commandRegistration.updatedAt),
          ...(transitioned ? { joinedAt: now } : {}),
          leftAt: null,
        },
      });
      await transaction.guildSettings.upsert({
        where: { guildId: guild.id },
        create: {
          guildId: guild.id,
          locale: this.services.config.application.defaultLocale,
          commandPrefix: this.services.config.discord.defaultPrefix,
        },
        update: {},
      });
      for (const moduleKey of ['general', 'moderation', 'onboarding']) {
        await transaction.guildModule.upsert({
          where: { guildId_moduleKey: { guildId: guild.id, moduleKey } },
          create: { guildId: guild.id, moduleKey, enabled: moduleKey === 'general' },
          update: {},
        });
      }
      if (transitioned) {
        await appendAuditLog(transaction, {
          guildId: guild.id,
          actorDiscordId: this.client.user.id,
          action: 'bot.installed',
          resourceType: 'DiscordGuildInstallation',
          resourceId: guild.id,
          requestId: `install_${guild.id}_${now.getTime()}`,
          outcome: 'SUCCESS',
          newValue: {
            botUserId: this.client.user.id,
            administrator: status.administrator,
            source,
          },
        });
      }
      return !transitioned;
    });

    const onboardingResources = OnboardingDiscordResourcesSchema.parse({
      guildId: guild.id,
      refreshedAt: now.toISOString(),
      bot: {
        canManageRoles: botMember.permissions.has(PermissionFlagsBits.ManageRoles),
        canManageChannels: botMember.permissions.has(PermissionFlagsBits.ManageChannels),
        highestRolePosition: botMember.roles.highest.position,
      },
      channels: guild.channels.cache
        .filter(
          (channel) =>
            channel.type === ChannelType.GuildText ||
            channel.type === ChannelType.GuildAnnouncement,
        )
        .map((channel) => {
          const permissions = channel.permissionsFor(botMember);
          return {
            id: channel.id,
            name: channel.name,
            type: channel.type === ChannelType.GuildText ? 'TEXT' : 'ANNOUNCEMENT',
            canView: permissions.has(PermissionFlagsBits.ViewChannel),
            canSend: permissions.has(PermissionFlagsBits.SendMessages),
            canEmbed: permissions.has(PermissionFlagsBits.EmbedLinks),
            canAttach: permissions.has(PermissionFlagsBits.AttachFiles),
            canManage: permissions.has(PermissionFlagsBits.ManageChannels),
          };
        }),
      categories: guild.channels.cache
        .filter((channel) => channel.type === ChannelType.GuildCategory)
        .map((channel) => ({
          id: channel.id,
          name: channel.name,
          canManage: channel.permissionsFor(botMember).has(PermissionFlagsBits.ManageChannels),
        })),
      roles: guild.roles.cache
        .sort((left, right) => right.position - left.position)
        .map((role) => ({
          id: role.id,
          name: role.name,
          color: role.color,
          position: role.position,
          managed: role.managed,
          assignable:
            role.id !== guild.id &&
            !role.managed &&
            botMember.permissions.has(PermissionFlagsBits.ManageRoles) &&
            role.position < botMember.roles.highest.position,
        })),
    });
    await Promise.all([
      this.services.cache.writeRuntimeState('bot:guild', guild.id, status, 45),
      this.services.cache.writeRuntimeState(
        'bot:onboarding-resources',
        guild.id,
        onboardingResources,
        45,
      ),
    ]);
    this.#knownGuildIds.add(guild.id);
    if (!wasInstalled) {
      await this.services.cache.publish({
        type: 'guild.config.updated',
        guildId: guild.id,
        version: settings?.version ?? 1,
        timestamp: now.toISOString(),
      });
    }
    this.services.logger.debug(
      {
        guildId: guild.id,
        administrator: status.administrator,
        missingPermissions: status.missingPermissions,
        source,
      },
      'guild runtime status synchronized',
    );
    return status;
  }

  public async removeGuild(guildId: string, source: string): Promise<void> {
    const now = new Date();
    await this.services.prisma.$transaction(async (transaction) => {
      const previous = await transaction.guild.findUnique({
        where: { id: guildId },
        select: { botInstalled: true },
      });
      await transaction.guild.updateMany({
        where: { id: guildId },
        data: {
          botInstalled: false,
          leftAt: now,
          botStatusUpdatedAt: now,
        },
      });
      if (previous?.botInstalled === true) {
        await appendAuditLog(transaction, {
          guildId,
          actorDiscordId: this.client.user.id,
          action: 'bot.removed',
          resourceType: 'DiscordGuildInstallation',
          resourceId: guildId,
          requestId: `remove_${guildId}_${now.getTime()}`,
          outcome: 'SUCCESS',
          metadata: { source },
        });
      }
    });
    await Promise.all([
      this.services.cache.deleteRuntimeState('bot:guild', guildId),
      this.services.cache.invalidate(guildId),
    ]);
    this.#knownGuildIds.delete(guildId);
    this.services.logger.info({ guildId, source }, 'guild installation marked inactive');
  }

  private configuredChannelIds(config: unknown): string[] {
    if (typeof config !== 'object' || config === null || Array.isArray(config)) return [];
    const auditChannelId = Reflect.get(config, 'auditChannelId');
    return typeof auditChannelId === 'string' && /^\d{17,20}$/.test(auditChannelId)
      ? [auditChannelId]
      : [];
  }
}
