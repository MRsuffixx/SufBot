import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  AutoRoleUpdateSchema,
  GoodbyeUpdateSchema,
  OnboardingBasicsInputSchema,
  OnboardingRepository,
  VerificationUpdateSchema,
  WelcomeCardUpdateSchema,
  WelcomeUpdateSchema,
} from '@sufbot/onboarding';
import { PaginationSchema } from '@sufbot/shared';
import { createApiKeyAuthenticator, createGuildAccessGuard } from '../authentication.js';
import type { ApiDependencies } from '../types.js';

const GuildParamsSchema = z.object({ guildId: z.string().regex(/^\d{17,20}$/) }).strict();

const actor = (request: FastifyRequest) => {
  const context = request.authContext;
  if (context === undefined) throw new TypeError('Authenticated route is missing auth context.');
  const userAgent = request.headers['user-agent']?.slice(0, 255);
  return {
    actorUserId: context.userId,
    actorDiscordId: context.discordUserId,
    requestId: request.id,
    source: 'api' as const,
    ...(userAgent === undefined ? {} : { userAgent }),
  };
};

export const registerOnboardingRoutes = async (
  app: FastifyInstance,
  dependencies: ApiDependencies,
): Promise<void> => {
  const authenticate = createApiKeyAuthenticator(dependencies);
  const read = createGuildAccessGuard(dependencies, 'guild:read');
  const write = createGuildAccessGuard(dependencies, 'guild:write');
  const repository = new OnboardingRepository(dependencies.prisma, dependencies.cache);

  app.get('/v1/guilds/:guildId/onboarding', {
    preHandler: [authenticate, read],
    schema: { tags: ['onboarding'], security: [{ apiKey: [] }] },
    handler: async (request) => {
      const { guildId } = GuildParamsSchema.parse(request.params);
      return {
        success: true,
        data: await repository.get(guildId),
        requestId: request.id,
      };
    },
  });

  app.get('/v1/guilds/:guildId/onboarding/status', {
    preHandler: [authenticate, read],
    schema: { tags: ['onboarding'], security: [{ apiKey: [] }] },
    handler: async (request) => {
      const { guildId } = GuildParamsSchema.parse(request.params);
      const config = await repository.get(guildId);
      return {
        success: true,
        data: {
          guildId,
          health: config.resourceHealth,
          verificationChannelConfigured: config.verificationChannelId !== null,
          verifiedRoleConfigured: config.verifiedRoleId !== null,
          unverifiedRoleConfigured:
            config.setupMode === 'EVERYONE_VISIBLE' || config.unverifiedRoleId !== null,
          verificationMessageConfigured: config.verificationMessageId !== null,
          version: config.version,
        },
        requestId: request.id,
      };
    },
  });

  app.get('/v1/guilds/:guildId/onboarding/logs', {
    preHandler: [authenticate, read],
    schema: { tags: ['onboarding'], security: [{ apiKey: [] }] },
    handler: async (request) => {
      const { guildId } = GuildParamsSchema.parse(request.params);
      const pagination = PaginationSchema.parse(request.query);
      const records = await dependencies.prisma.onboardingEvent.findMany({
        where: { guildId },
        orderBy: { occurredAt: 'desc' },
        take: pagination.limit,
        skip: (pagination.page - 1) * pagination.limit,
        select: {
          id: true,
          userId: true,
          eventType: true,
          status: true,
          errorCode: true,
          occurredAt: true,
          processedAt: true,
        },
      });
      return { success: true, data: records, requestId: request.id };
    },
  });

  app.patch('/v1/guilds/:guildId/onboarding', {
    preHandler: [authenticate, write],
    schema: { tags: ['onboarding'], security: [{ apiKey: [] }] },
    handler: async (request) => {
      const { guildId } = GuildParamsSchema.parse(request.params);
      const input = OnboardingBasicsInputSchema.parse(request.body);
      return {
        success: true,
        data: await repository.updateBasics(input, guildId, actor(request)),
        requestId: request.id,
      };
    },
  });

  const sectionRoutes = [
    {
      path: '/v1/guilds/:guildId/onboarding/welcome',
      schema: WelcomeUpdateSchema,
      update: (input: unknown, guildId: string, request: FastifyRequest) =>
        repository.updateWelcome(input, guildId, actor(request)),
    },
    {
      path: '/v1/guilds/:guildId/onboarding/goodbye',
      schema: GoodbyeUpdateSchema,
      update: (input: unknown, guildId: string, request: FastifyRequest) =>
        repository.updateGoodbye(input, guildId, actor(request)),
    },
    {
      path: '/v1/guilds/:guildId/onboarding/verification',
      schema: VerificationUpdateSchema,
      update: (input: unknown, guildId: string, request: FastifyRequest) =>
        repository.updateVerification(input, guildId, actor(request)),
    },
    {
      path: '/v1/guilds/:guildId/onboarding/roles',
      schema: AutoRoleUpdateSchema,
      update: (input: unknown, guildId: string, request: FastifyRequest) =>
        repository.updateRoles(input, guildId, actor(request)),
    },
    {
      path: '/v1/guilds/:guildId/onboarding/welcome-card',
      schema: WelcomeCardUpdateSchema,
      update: (input: unknown, guildId: string, request: FastifyRequest) =>
        repository.updateWelcomeCard(input, guildId, actor(request)),
    },
  ] as const;

  for (const route of sectionRoutes) {
    app.patch(route.path, {
      preHandler: [authenticate, write],
      schema: { tags: ['onboarding'], security: [{ apiKey: [] }] },
      handler: async (request) => {
        const { guildId } = GuildParamsSchema.parse(request.params);
        const input = route.schema.parse(request.body);
        return {
          success: true,
          data: await route.update(input, guildId, request),
          requestId: request.id,
        };
      },
    });
  }
};
