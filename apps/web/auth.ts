import 'server-only';

import NextAuth from 'next-auth';
import Discord from 'next-auth/providers/discord';
import { storeDiscordCredential } from '@sufbot/auth';
import { appendAuditLog } from '@sufbot/database';
import { createId } from '@sufbot/shared';
import { appConfig, prisma, webEnvironment, webLogger } from '@/lib/runtime';

const platformRoleFor = (discordId: string): 'USER' | 'ADMIN' | 'DEVELOPER' | 'OWNER' => {
  if (webEnvironment.BOT_OWNER_DISCORD_IDS.includes(discordId)) return 'OWNER';
  if (webEnvironment.BOT_DEVELOPER_DISCORD_IDS.includes(discordId)) return 'DEVELOPER';
  if (webEnvironment.PLATFORM_ADMIN_DISCORD_IDS.includes(discordId)) return 'ADMIN';
  return 'USER';
};

const isPlatformRole = (value: unknown): value is 'USER' | 'ADMIN' | 'DEVELOPER' | 'OWNER' =>
  value === 'USER' || value === 'ADMIN' || value === 'DEVELOPER' || value === 'OWNER';

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: webEnvironment.AUTH_TRUST_HOST,
  secret: webEnvironment.AUTH_SECRET,
  providers: [
    Discord({
      clientId: webEnvironment.DISCORD_CLIENT_ID,
      clientSecret: webEnvironment.DISCORD_CLIENT_SECRET,
      authorization: { params: { scope: 'identify guilds' } },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: appConfig.security.session.maxAgeSeconds,
    updateAge: 300,
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  cookies: {
    sessionToken: {
      name:
        webEnvironment.NODE_ENV === 'production'
          ? '__Secure-sufbot.session-token'
          : 'sufbot.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: webEnvironment.NODE_ENV === 'production',
      },
    },
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account != null && profile !== undefined && typeof profile.id === 'string') {
        const discordId = profile.id;
        const displayName =
          typeof profile.global_name === 'string'
            ? profile.global_name
            : typeof profile.username === 'string'
              ? profile.username
              : 'Discord user';
        const user = await prisma.user.upsert({
          where: { discordId },
          create: {
            discordId,
            displayName,
            avatarHash: typeof profile.avatar === 'string' ? profile.avatar : null,
            platformRole: platformRoleFor(discordId),
            lastLoginAt: new Date(),
          },
          update: {
            displayName,
            avatarHash: typeof profile.avatar === 'string' ? profile.avatar : null,
            platformRole: platformRoleFor(discordId),
            lastLoginAt: new Date(),
            deletedAt: null,
          },
        });
        if (typeof account.access_token !== 'string' || typeof account.expires_at !== 'number') {
          throw new Error('Discord OAuth response did not include a usable access token.');
        }
        await storeDiscordCredential(
          prisma,
          user.id,
          {
            accessToken: account.access_token,
            ...(typeof account.refresh_token === 'string'
              ? { refreshToken: account.refresh_token }
              : {}),
            expiresAt: new Date(account.expires_at * 1000),
            ...(typeof account.scope === 'string' ? { scope: account.scope } : {}),
            ...(typeof account.token_type === 'string' ? { tokenType: account.token_type } : {}),
          },
          webEnvironment.ENCRYPTION_KEY,
        );
        token.userId = user.id;
        token.discordId = discordId;
        token.platformRole = user.platformRole;
        token.sessionVersion = user.sessionVersion;
        token.revoked = false;
        return token;
      }

      if (typeof token.userId === 'string') {
        const user = await prisma.user.findUnique({
          where: { id: token.userId },
          select: { sessionVersion: true, platformRole: true, deletedAt: true },
        });
        token.revoked =
          user === null || user.deletedAt !== null || user.sessionVersion !== token.sessionVersion;
        if (user !== null) token.platformRole = user.platformRole;
      }
      return token;
    },
    session({ session, token }) {
      if (
        typeof token.userId !== 'string' ||
        typeof token.discordId !== 'string' ||
        !isPlatformRole(token.platformRole)
      ) {
        return session;
      }
      session.user.id = token.userId;
      session.user.discordId = token.discordId;
      session.user.platformRole = token.platformRole;
      if (token.revoked === true) session.error = 'SessionRevoked';
      return session;
    },
    redirect({ url, baseUrl }) {
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      try {
        return new URL(url).origin === baseUrl ? url : baseUrl;
      } catch {
        return baseUrl;
      }
    },
  },
  events: {
    async signIn({ user }) {
      const discordId = user.id;
      const persistedUser =
        typeof discordId === 'string'
          ? await prisma.user.findUnique({
              where: { discordId },
              select: { id: true },
            })
          : null;
      if (persistedUser !== null && typeof discordId === 'string') {
        await appendAuditLog(prisma, {
          actorUserId: persistedUser.id,
          actorDiscordId: discordId,
          action: 'auth.sign-in.succeeded',
          resourceType: 'UserSession',
          resourceId: persistedUser.id,
          requestId: createId('req'),
          outcome: 'SUCCESS',
        });
      }
      webLogger.info({ authUserId: persistedUser?.id }, 'dashboard authentication succeeded');
    },
  },
  debug: false,
});
