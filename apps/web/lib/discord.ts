import {
  canManageDiscordGuild,
  fetchDiscordGuilds,
  getValidDiscordAccessToken,
  requireGuildAccess,
  syncGuildAccessGrants,
  type DiscordGuild,
} from '@sufbot/auth';
import { appConfig, prisma, webEnvironment } from './runtime';

export type DashboardGuild = DiscordGuild & {
  canManage: boolean;
  botInstalled: boolean;
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
    select: { id: true, name: true, botInstalled: true, leftAt: true },
  });
  const storedById = new Map(stored.map((guild) => [guild.id, guild]));
  return discordGuilds
    .map((guild) => {
      const databaseGuild = storedById.get(guild.id);
      return {
        ...guild,
        canManage: canManageDiscordGuild(guild),
        botInstalled: databaseGuild?.botInstalled === true && databaseGuild.leftAt === null,
        ...(databaseGuild === undefined ? {} : { storedName: databaseGuild.name }),
      };
    })
    .sort((left, right) => {
      if (left.canManage !== right.canManage) return left.canManage ? -1 : 1;
      return left.name.localeCompare(right.name);
    });
};

export const requireLiveGuildAccess = async (userId: string, guildId: string) => {
  await loadDashboardGuilds(userId);
  return requireGuildAccess(prisma, userId, guildId);
};

const invitePermissions = {
  ModerateMembers: 1n << 40n,
  ViewAuditLog: 1n << 7n,
  SendMessages: 1n << 11n,
} as const;

export const botInviteUrl = (guildId?: string): string => {
  const permissions = appConfig.discord.requiredInvitePermissions.reduce(
    (sum, permission) =>
      sum + (invitePermissions[permission as keyof typeof invitePermissions] ?? 0n),
    0n,
  );
  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('client_id', webEnvironment.DISCORD_CLIENT_ID);
  url.searchParams.set('scope', 'bot applications.commands');
  url.searchParams.set('permissions', permissions.toString());
  if (guildId !== undefined) {
    url.searchParams.set('guild_id', guildId);
    url.searchParams.set('disable_guild_select', 'true');
  }
  return url.toString();
};

