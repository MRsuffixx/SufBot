import type { PrismaClient } from '@sufbot/database/generated';
import { AuthorizationError, NotFoundError } from '@sufbot/shared';
import { DiscordPermission } from '@sufbot/permissions';

export type GuildAccess = {
  guildId: string;
  userId: string;
  discordUserId: string;
  permissionBitfield: bigint;
  isOwner: boolean;
};

export const requireGuildAccess = async (
  prisma: PrismaClient,
  userId: string,
  guildId: string,
  now = new Date(),
): Promise<GuildAccess> => {
  const [user, guild, grant] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { discordId: true, platformRole: true } }),
    prisma.guild.findUnique({ where: { id: guildId }, select: { ownerDiscordId: true } }),
    prisma.guildAccessGrant.findUnique({ where: { userId_guildId: { userId, guildId } } }),
  ]);
  if (user === null) throw new AuthorizationError('Authenticated user was not found.');
  if (guild === null) throw new NotFoundError('Guild');
  if (user.platformRole !== 'USER') {
    return {
      guildId,
      userId,
      discordUserId: user.discordId,
      permissionBitfield: DiscordPermission.Administrator,
      isOwner: user.discordId === guild.ownerDiscordId,
    };
  }
  if (grant === null || grant.expiresAt <= now) {
    throw new AuthorizationError(
      'Guild permissions are stale. Re-authenticate with Discord.',
      'GUILD_ACCESS_STALE',
    );
  }
  const permissions = BigInt(grant.permissionBitfield);
  const canManage =
    grant.isOwner ||
    (permissions & DiscordPermission.Administrator) === DiscordPermission.Administrator ||
    (permissions & DiscordPermission.ManageGuild) === DiscordPermission.ManageGuild;
  if (!canManage) {
    throw new AuthorizationError(
      'You do not have permission to manage this guild.',
      'GUILD_ACCESS_DENIED',
    );
  }
  return {
    guildId,
    userId,
    discordUserId: user.discordId,
    permissionBitfield: permissions,
    isOwner: grant.isOwner,
  };
};

export const requireBotInGuild = async (prisma: PrismaClient, guildId: string): Promise<void> => {
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { botInstalled: true, leftAt: true },
  });
  if (guild === null || !guild.botInstalled || guild.leftAt !== null) {
    throw new NotFoundError('Installed guild');
  }
};

