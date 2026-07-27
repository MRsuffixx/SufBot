import 'server-only';

import {
  canManageDiscordGuild,
  fetchDiscordGuilds,
  getValidDiscordAccessToken,
  requireGuildAccess,
  syncGuildAccessGrants,
  type DiscordGuild,
} from '@sufbot/auth';
import {
  BotGuildRuntimeStatusSchema,
  buildDiscordInstallationUrl,
  resolveDiscordInstallationPermissions,
  resolveGuildInstallation,
  type ResolvedGuildInstallation,
} from '@sufbot/discord';
import { canonicalDiscordApplicationId } from '@sufbot/config';
import {
  appConfig,
  cache,
  ensureCacheConnection,
  prisma,
  webEnvironment,
  webLogger,
} from './runtime';

export type DashboardGuild = DiscordGuild & {
  canManage: boolean;
  botInstalled: boolean;
  installation: ResolvedGuildInstallation;
  storedName?: string;
};

export const loadDashboardGuilds = async (userId: string): Promise<DashboardGuild[]> => {
  const accessToken = await getValidDiscordAccessToken(
    prisma,
    userId,
    webEnvironment.ENCRYPTION_KEY,
    webEnvironment.DISCORD_CLIENT_ID,
    webEnvironment.DISCORD_CLIENT_SECRET,
  );
  const discordGuilds = await fetchDiscordGuilds(accessToken);
  await syncGuildAccessGrants(
    prisma,
    userId,
    discordGuilds,
    appConfig.security.session.guildPermissionFreshnessSeconds,
  );
  const stored = await prisma.guild.findMany({
    where: { id: { in: discordGuilds.map((guild) => guild.id) } },
    select: {
      id: true,
      name: true,
      botInstalled: true,
      leftAt: true,
      botUserId: true,
      botPermissionBitfield: true,
      botHasAdministrator: true,
      botHighestRolePosition: true,
      botStatusUpdatedAt: true,
      botLastSeenAt: true,
      commandRegistrationMode: true,
      commandRegistrationStatus: true,
      registeredCommandCount: true,
      commandSchemaHash: true,
      commandRegistrationUpdatedAt: true,
    },
  });
  const storedById = new Map(stored.map((guild) => [guild.id, guild]));
  const liveBotInstances = await loadLiveBotInstanceCount();
  const resolved = await Promise.all(
    discordGuilds.map(async (guild) => {
      const databaseGuild = storedById.get(guild.id);
      const runtime = await loadRuntimeGuildStatus(guild.id);
      const installation = resolveGuildInstallation({
        runtime,
        stored: databaseGuild ?? null,
        liveBotInstances,
      });
      return {
        ...guild,
        canManage: canManageDiscordGuild(guild),
        botInstalled: installation.installed,
        installation,
        ...(databaseGuild === undefined ? {} : { storedName: databaseGuild.name }),
      };
    }),
  );
  return resolved.sort((left, right) => {
    if (left.canManage !== right.canManage) return left.canManage ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
};

export const requireLiveGuildAccess = async (userId: string, guildId: string) => {
  await loadDashboardGuilds(userId);
  return requireGuildAccess(prisma, userId, guildId);
};

const loadLiveBotInstanceCount = async (): Promise<number> => {
  try {
    await ensureCacheConnection();
    return await cache.countLiveServiceInstances('bot');
  } catch (error) {
    webLogger.warn({ err: error }, 'bot heartbeat could not be read');
    return 0;
  }
};

const loadRuntimeGuildStatus = async (guildId: string) => {
  try {
    await ensureCacheConnection();
    return await cache.readRuntimeState('bot:guild', guildId, BotGuildRuntimeStatusSchema);
  } catch (error) {
    webLogger.warn({ err: error, guildId }, 'guild runtime status could not be read');
    return null;
  }
};

export const loadGuildInstallation = async (
  guildId: string,
): Promise<ResolvedGuildInstallation> => {
  const [stored, runtime, liveBotInstances] = await Promise.all([
    prisma.guild.findUnique({
      where: { id: guildId },
      select: {
        botInstalled: true,
        leftAt: true,
        botUserId: true,
        botPermissionBitfield: true,
        botHasAdministrator: true,
        botHighestRolePosition: true,
        botStatusUpdatedAt: true,
        botLastSeenAt: true,
        commandRegistrationMode: true,
        commandRegistrationStatus: true,
        registeredCommandCount: true,
        commandSchemaHash: true,
        commandRegistrationUpdatedAt: true,
      },
    }),
    loadRuntimeGuildStatus(guildId),
    loadLiveBotInstanceCount(),
  ]);
  return resolveGuildInstallation({ runtime, stored, liveBotInstances });
};

export const botInviteUrl = (guildId?: string): string => {
  return buildDiscordInstallationUrl({
    applicationId: canonicalDiscordApplicationId(webEnvironment),
    permissions: resolveDiscordInstallationPermissions(appConfig.discord.requiredInvitePermissions),
    ...(guildId === undefined ? {} : { guildId, disableGuildSelect: true }),
  });
};
