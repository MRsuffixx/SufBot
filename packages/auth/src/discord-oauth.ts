import type { PrismaClient } from '@sufbot/database/generated';
import { AuthenticationError, DiscordApiError, decryptString, encryptString } from '@sufbot/shared';
import { DiscordPermission } from '@sufbot/permissions';

const DISCORD_API = 'https://discord.com/api/v10';
const DISCORD_TOKEN_ENDPOINT = 'https://discord.com/api/oauth2/token';

export type DiscordGuild = {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
};

type StoredCredential = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  scope?: string;
  tokenType?: string;
};

type DiscordTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
};

const parseTokenResponse = (value: unknown): DiscordTokenResponse => {
  if (typeof value !== 'object' || value === null) throw new DiscordApiError();
  const record = value as Record<string, unknown>;
  if (
    typeof record.access_token !== 'string' ||
    typeof record.expires_in !== 'number' ||
    (record.refresh_token !== undefined && typeof record.refresh_token !== 'string')
  ) {
    throw new DiscordApiError('Discord returned an invalid OAuth token response.');
  }
  return {
    access_token: record.access_token,
    expires_in: record.expires_in,
    ...(typeof record.refresh_token === 'string' ? { refresh_token: record.refresh_token } : {}),
    ...(typeof record.scope === 'string' ? { scope: record.scope } : {}),
    ...(typeof record.token_type === 'string' ? { token_type: record.token_type } : {}),
  };
};

export const storeDiscordCredential = async (
  prisma: PrismaClient,
  userId: string,
  credential: StoredCredential,
  encryptionKey: string,
): Promise<void> => {
  await prisma.oAuthCredential.upsert({
    where: { userId },
    create: {
      userId,
      accessTokenCiphertext: encryptString(credential.accessToken, encryptionKey),
      expiresAt: credential.expiresAt,
      ...(credential.refreshToken === undefined
        ? {}
        : { refreshTokenCiphertext: encryptString(credential.refreshToken, encryptionKey) }),
      ...(credential.scope === undefined ? {} : { scope: credential.scope }),
      ...(credential.tokenType === undefined ? {} : { tokenType: credential.tokenType }),
    },
    update: {
      accessTokenCiphertext: encryptString(credential.accessToken, encryptionKey),
      expiresAt: credential.expiresAt,
      ...(credential.refreshToken === undefined
        ? {}
        : { refreshTokenCiphertext: encryptString(credential.refreshToken, encryptionKey) }),
      ...(credential.scope === undefined ? {} : { scope: credential.scope }),
      ...(credential.tokenType === undefined ? {} : { tokenType: credential.tokenType }),
    },
  });
};

const loadCredential = async (
  prisma: PrismaClient,
  userId: string,
  encryptionKey: string,
): Promise<StoredCredential> => {
  const stored = await prisma.oAuthCredential.findUnique({ where: { userId } });
  if (stored === null) throw new AuthenticationError('Discord authorization is missing.');
  return {
    accessToken: decryptString(stored.accessTokenCiphertext, encryptionKey),
    ...(stored.refreshTokenCiphertext === null
      ? {}
      : { refreshToken: decryptString(stored.refreshTokenCiphertext, encryptionKey) }),
    expiresAt: stored.expiresAt,
    ...(stored.scope === null ? {} : { scope: stored.scope }),
    ...(stored.tokenType === null ? {} : { tokenType: stored.tokenType }),
  };
};

export const getValidDiscordAccessToken = async (
  prisma: PrismaClient,
  userId: string,
  encryptionKey: string,
  clientId: string,
  clientSecret: string,
): Promise<string> => {
  const credential = await loadCredential(prisma, userId, encryptionKey);
  if (credential.expiresAt.getTime() > Date.now() + 60_000) return credential.accessToken;
  if (credential.refreshToken === undefined) {
    throw new AuthenticationError('Discord authorization expired. Please sign in again.');
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: credential.refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const response = await fetch(DISCORD_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new AuthenticationError('Discord authorization expired. Please sign in again.');
  }
  const refreshed = parseTokenResponse(await response.json());
  await storeDiscordCredential(
    prisma,
    userId,
    {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? credential.refreshToken,
      expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      ...(refreshed.scope === undefined ? {} : { scope: refreshed.scope }),
      ...(refreshed.token_type === undefined ? {} : { tokenType: refreshed.token_type }),
    },
    encryptionKey,
  );
  return refreshed.access_token;
};

export const fetchDiscordGuilds = async (accessToken: string): Promise<DiscordGuild[]> => {
  const response = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 401) throw new AuthenticationError('Discord authorization is stale.');
  if (!response.ok) throw new DiscordApiError('Unable to load Discord guilds.');
  const data = (await response.json()) as unknown;
  if (!Array.isArray(data)) throw new DiscordApiError('Discord returned an invalid guild list.');
  return data.flatMap((item): DiscordGuild[] => {
    if (typeof item !== 'object' || item === null) return [];
    const guild = item as Record<string, unknown>;
    if (
      typeof guild.id !== 'string' ||
      typeof guild.name !== 'string' ||
      typeof guild.owner !== 'boolean' ||
      typeof guild.permissions !== 'string'
    ) {
      return [];
    }
    return [
      {
        id: guild.id,
        name: guild.name,
        icon: typeof guild.icon === 'string' ? guild.icon : null,
        owner: guild.owner,
        permissions: guild.permissions,
      },
    ];
  });
};

export const canManageDiscordGuild = (guild: DiscordGuild): boolean => {
  const permissions = BigInt(guild.permissions);
  return (
    guild.owner ||
    (permissions & DiscordPermission.Administrator) === DiscordPermission.Administrator ||
    (permissions & DiscordPermission.ManageGuild) === DiscordPermission.ManageGuild
  );
};

export const syncGuildAccessGrants = async (
  prisma: PrismaClient,
  userId: string,
  guilds: readonly DiscordGuild[],
  freshnessSeconds: number,
): Promise<void> => {
  const manageable = guilds.filter(canManageDiscordGuild);
  const guildIds = manageable.map((guild) => guild.id);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + freshnessSeconds * 1000);
  await prisma.$transaction(async (transaction) => {
    await transaction.guildAccessGrant.deleteMany({
      where: {
        userId,
        ...(guildIds.length === 0 ? {} : { guildId: { notIn: guildIds } }),
      },
    });
    for (const guild of manageable) {
      await transaction.guild.upsert({
        where: { id: guild.id },
        create: {
          id: guild.id,
          name: guild.name,
          iconHash: guild.icon,
          ownerDiscordId: guild.owner
            ? (
                await transaction.user.findUniqueOrThrow({
                  where: { id: userId },
                  select: { discordId: true },
                })
              ).discordId
            : '0',
          botInstalled: false,
        },
        update: { name: guild.name, iconHash: guild.icon },
      });
      await transaction.guildAccessGrant.upsert({
        where: { userId_guildId: { userId, guildId: guild.id } },
        create: {
          userId,
          guildId: guild.id,
          isOwner: guild.owner,
          permissionBitfield: guild.permissions,
          verifiedAt: now,
          expiresAt,
        },
        update: {
          isOwner: guild.owner,
          permissionBitfield: guild.permissions,
          verifiedAt: now,
          expiresAt,
        },
      });
    }
  });
};
