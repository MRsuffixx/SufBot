import type { FastifyReply, FastifyRequest } from 'fastify';
import { requireGuildAccess } from '@sufbot/auth';
import { AuthorizationError, AuthenticationError, sha256 } from '@sufbot/shared';
import type { ApiDependencies } from './types.js';

const getBearerToken = (request: FastifyRequest): string => {
  const authorization = request.headers.authorization;
  if (authorization === undefined || !authorization.startsWith('Bearer ')) {
    throw new AuthenticationError();
  }
  const token = authorization.slice('Bearer '.length);
  if (!/^suf_[A-Za-z0-9_-]{32,128}$/.test(token)) {
    throw new AuthenticationError('API key is invalid.');
  }
  return token;
};

export const createApiKeyAuthenticator =
  (dependencies: ApiDependencies) =>
  async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const token = getBearerToken(request);
    const apiKey = await dependencies.prisma.apiKey.findUnique({
      where: { keyHash: sha256(token) },
      include: { user: { select: { discordId: true, deletedAt: true } } },
    });
    if (
      apiKey === null ||
      apiKey.status !== 'ACTIVE' ||
      apiKey.user.deletedAt !== null ||
      apiKey.revokedAt !== null ||
      (apiKey.expiresAt !== null && apiKey.expiresAt <= new Date())
    ) {
      throw new AuthenticationError('API key is invalid or expired.');
    }
    request.authContext = {
      kind: 'api-key',
      userId: apiKey.userId,
      discordUserId: apiKey.user.discordId,
      apiKeyId: apiKey.id,
      scopes: new Set(apiKey.scopes),
      ...(apiKey.guildId === null ? {} : { guildId: apiKey.guildId }),
    };
    void dependencies.prisma.apiKey
      .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
      .catch((error: unknown) => {
        dependencies.logger.warn({ err: error, apiKeyId: apiKey.id }, 'API key usage timestamp failed');
      });
  };

export const requireScope = (request: FastifyRequest, scope: string): void => {
  const context = request.authContext;
  if (context === undefined) throw new AuthenticationError();
  if (!context.scopes.has(scope) && !context.scopes.has('*')) {
    throw new AuthorizationError(`The ${scope} scope is required.`, 'API_SCOPE_DENIED');
  }
};

const readGuildId = (request: FastifyRequest): string => {
  const params = request.params;
  if (typeof params !== 'object' || params === null || !('guildId' in params)) {
    throw new AuthorizationError('Guild scope is missing.', 'GUILD_SCOPE_MISSING');
  }
  const guildId = (params as { guildId?: unknown }).guildId;
  if (typeof guildId !== 'string' || !/^\d{17,20}$/.test(guildId)) {
    throw new AuthorizationError('Guild scope is invalid.', 'GUILD_SCOPE_INVALID');
  }
  return guildId;
};

export const createGuildAccessGuard =
  (dependencies: ApiDependencies, scope: string) =>
  async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    requireScope(request, scope);
    const context = request.authContext;
    if (context === undefined) throw new AuthenticationError();
    const guildId = readGuildId(request);
    if (context.guildId !== undefined && context.guildId !== guildId) {
      throw new AuthorizationError('API key is scoped to another guild.', 'CROSS_GUILD_ACCESS_DENIED');
    }
    await requireGuildAccess(dependencies.prisma, context.userId, guildId);
  };

