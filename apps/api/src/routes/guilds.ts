import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { GuildModuleInputSchema, GuildSettingsInputSchema, PaginationSchema } from '@sufbot/shared';
import { GuildRepository } from '@sufbot/database';
import {
  createApiKeyAuthenticator,
  createGuildAccessGuard,
  requireScope,
} from '../authentication.js';
import type { ApiDependencies } from '../types.js';

const GuildParamsSchema = z.object({ guildId: z.string().regex(/^\d{17,20}$/) });
const ModuleParamsSchema = GuildParamsSchema.extend({
  moduleKey: z.string().regex(/^[a-z][a-z0-9-]{1,63}$/),
});

const actorFromRequest = (request: FastifyRequest) => {
  const context = request.authContext;
  if (context === undefined) throw new TypeError('Authenticated route is missing auth context.');
  const userAgent = request.headers['user-agent']?.slice(0, 255);
  return {
    userId: context.userId,
    discordUserId: context.discordUserId,
    requestId: request.id,
    ...(userAgent === undefined ? {} : { userAgent }),
  };
};

export const registerGuildRoutes = async (
  app: FastifyInstance,
  dependencies: ApiDependencies,
): Promise<void> => {
  const authenticate = createApiKeyAuthenticator(dependencies);
  const guildRead = createGuildAccessGuard(dependencies, 'guild:read');
  const guildWrite = createGuildAccessGuard(dependencies, 'guild:write');
  const repository = new GuildRepository(dependencies.prisma);

  app.get('/v1/guilds', {
    preHandler: authenticate,
    schema: { tags: ['guilds'], security: [{ apiKey: [] }] },
    handler: async (request) => {
      requireScope(request, 'guild:read');
      const context = request.authContext;
      if (context === undefined) throw new TypeError('Auth context missing.');
      const grants = await dependencies.prisma.guildAccessGrant.findMany({
        where: {
          userId: context.userId,
          expiresAt: { gt: new Date() },
          ...(context.guildId === undefined ? {} : { guildId: context.guildId }),
        },
        include: {
          guild: {
            select: { id: true, name: true, iconHash: true, botInstalled: true, leftAt: true },
          },
        },
        orderBy: { guild: { name: 'asc' } },
        take: dependencies.config.security.maxPaginationSize,
      });
      return {
        success: true,
        data: grants.map((grant) => ({
          ...grant.guild,
          canManage: true,
          permissionVerifiedAt: grant.verifiedAt,
        })),
        requestId: request.id,
      };
    },
  });

  app.get('/v1/guilds/:guildId', {
    preHandler: [authenticate, guildRead],
    schema: { tags: ['guilds'], security: [{ apiKey: [] }] },
    handler: async (request) => {
      const { guildId } = GuildParamsSchema.parse(request.params);
      const guild = await dependencies.prisma.guild.findUniqueOrThrow({
        where: { id: guildId },
        include: { settings: true },
      });
      return { success: true, data: guild, requestId: request.id };
    },
  });

  app.get('/v1/guilds/:guildId/settings', {
    preHandler: [authenticate, guildRead],
    schema: { tags: ['guilds'], security: [{ apiKey: [] }] },
    handler: async (request) => {
      const { guildId } = GuildParamsSchema.parse(request.params);
      const settings = await repository.getSettings(guildId);
      return { success: true, data: settings, requestId: request.id };
    },
  });

  app.patch('/v1/guilds/:guildId/settings', {
    preHandler: [authenticate, guildWrite],
    schema: { tags: ['guilds'], security: [{ apiKey: [] }] },
    handler: async (request) => {
      const { guildId } = GuildParamsSchema.parse(request.params);
      const input = GuildSettingsInputSchema.parse(request.body);
      const updated = await repository.updateSettings(guildId, input, actorFromRequest(request));
      await dependencies.cache.publish({
        type: 'guild.config.updated',
        guildId,
        version: updated.version,
        timestamp: new Date().toISOString(),
      });
      return { success: true, data: updated, requestId: request.id };
    },
  });

  app.get('/v1/guilds/:guildId/modules', {
    preHandler: [authenticate, guildRead],
    schema: { tags: ['guilds'], security: [{ apiKey: [] }] },
    handler: async (request) => {
      const { guildId } = GuildParamsSchema.parse(request.params);
      return {
        success: true,
        data: await repository.listModules(guildId),
        requestId: request.id,
      };
    },
  });

  app.patch('/v1/guilds/:guildId/modules/:moduleKey', {
    preHandler: [authenticate, guildWrite],
    schema: { tags: ['guilds'], security: [{ apiKey: [] }] },
    handler: async (request) => {
      const { guildId, moduleKey } = ModuleParamsSchema.parse(request.params);
      const input = GuildModuleInputSchema.parse(request.body);
      const updated = await repository.updateModule(
        guildId,
        moduleKey,
        input,
        actorFromRequest(request),
      );
      await dependencies.cache.publish({
        type: 'guild.config.updated',
        guildId,
        module: moduleKey,
        version: updated.version,
        timestamp: new Date().toISOString(),
      });
      return { success: true, data: updated, requestId: request.id };
    },
  });

  app.get('/v1/guilds/:guildId/commands', {
    preHandler: [authenticate, guildRead],
    schema: { tags: ['guilds'], security: [{ apiKey: [] }] },
    handler: async (request) => {
      const { guildId } = GuildParamsSchema.parse(request.params);
      const overrides = await dependencies.prisma.guildCommandOverride.findMany({
        where: { guildId },
        orderBy: [{ commandName: 'asc' }, { subjectType: 'asc' }],
      });
      return { success: true, data: overrides, requestId: request.id };
    },
  });

  app.get('/v1/guilds/:guildId/audit-logs', {
    preHandler: [authenticate, guildRead],
    schema: { tags: ['audit'], security: [{ apiKey: [] }] },
    handler: async (request) => {
      const { guildId } = GuildParamsSchema.parse(request.params);
      const query = PaginationSchema.parse(request.query);
      const limit = Math.min(query.limit, dependencies.config.security.maxPaginationSize);
      const records = await dependencies.prisma.guildAuditLog.findMany({
        where: { guildId },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * limit,
        take: limit,
      });
      return {
        success: true,
        data: records,
        pagination: { page: query.page, limit },
        requestId: request.id,
      };
    },
  });
};
