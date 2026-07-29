import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  AutoRoleUpdateSchema,
  GoodbyeUpdateSchema,
  OnboardingBasicsInputSchema,
  OnboardingDiscordResourcesSchema,
  OnboardingPreviewInputSchema,
  OnboardingRepository,
  OnboardingTestRequestSchema,
  VerificationSetupRequestSchema,
  VerificationUpdateSchema,
  WelcomeCardUpdateSchema,
  WelcomeUpdateSchema,
  renderOnboardingMessage,
  safeTemplateText,
  validateAutoRoleResources,
  validateGoodbyeResources,
  validateWelcomeResources,
} from '@sufbot/onboarding';
import { AppError, PaginationSchema } from '@sufbot/shared';
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
  const resourcesFor = async (guildId: string) => {
    const resources = await dependencies.cache.readRuntimeState(
      'bot:onboarding-resources',
      guildId,
      OnboardingDiscordResourcesSchema,
    );
    if (resources === null) {
      throw new AppError({
        code: 'ONBOARDING_RESOURCE_SNAPSHOT_UNAVAILABLE',
        message: 'Live Discord channels and roles are unavailable. Confirm the bot is online.',
        statusCode: 503,
      });
    }
    return resources;
  };
  const requireValidResources = (issues: readonly { code: string; message: string }[]): void => {
    const issue = issues[0];
    if (issue !== undefined) {
      throw new AppError({
        code: `ONBOARDING_${issue.code}`,
        message: issue.message,
        statusCode: 409,
      });
    }
  };

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

  app.get('/v1/guilds/:guildId/onboarding/resources', {
    preHandler: [authenticate, read],
    schema: { tags: ['onboarding'], security: [{ apiKey: [] }] },
    handler: async (request) => {
      const { guildId } = GuildParamsSchema.parse(request.params);
      return {
        success: true,
        data: await resourcesFor(guildId),
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

  app.post('/v1/guilds/:guildId/onboarding/preview', {
    preHandler: [authenticate, write],
    config: { rateLimit: { max: 10, timeWindow: 60_000, ban: 0 } },
    schema: { tags: ['onboarding'], security: [{ apiKey: [] }] },
    handler: async (request) => {
      const { guildId } = GuildParamsSchema.parse(request.params);
      const input = OnboardingPreviewInputSchema.parse(request.body);
      const context = request.authContext;
      if (context === undefined)
        throw new TypeError('Authenticated route is missing auth context.');
      return {
        success: true,
        data: renderOnboardingMessage(
          input.message,
          {
            user: `<@${context.discordUserId}>`,
            'user.mention': `<@${context.discordUserId}>`,
            'user.id': context.discordUserId,
            'user.username': 'preview-user',
            'user.displayName': 'Preview User',
            'user.globalName': 'Preview User',
            'user.tag': 'preview-user',
            'user.avatar': 'https://cdn.discordapp.com/embed/avatars/0.png',
            server: 'Preview Server',
            'server.name': 'Preview Server',
            'server.id': guildId,
            'server.memberCount': 42,
            'member.number': 42,
            'member.roles': safeTemplateText('@everyone'),
            date: new Date(),
            time: new Date(),
            datetime: new Date(),
          },
          context.discordUserId,
        ),
        requestId: request.id,
      };
    },
  });

  app.post('/v1/guilds/:guildId/onboarding/test', {
    preHandler: [authenticate, write],
    config: { rateLimit: { max: 3, timeWindow: 60_000, ban: 0 } },
    schema: { tags: ['onboarding'], security: [{ apiKey: [] }] },
    handler: async (request) => {
      const { guildId } = GuildParamsSchema.parse(request.params);
      const input = OnboardingTestRequestSchema.parse(request.body);
      const context = request.authContext;
      if (context === undefined)
        throw new TypeError('Authenticated route is missing auth context.');
      if (dependencies.onboardingQueue === undefined) {
        throw new AppError({
          code: 'ONBOARDING_QUEUE_UNAVAILABLE',
          message: 'Onboarding test delivery is temporarily unavailable.',
          statusCode: 503,
        });
      }
      const job =
        input.delivery === 'WELCOME_CHANNEL'
          ? ('onboarding.test-welcome-channel' as const)
          : input.delivery === 'WELCOME_DM'
            ? ('onboarding.test-welcome-dm' as const)
            : ('onboarding.test-goodbye-channel' as const);
      const queuedAt = new Date().toISOString();
      await dependencies.onboardingQueue.enqueueOnboarding({
        job,
        idempotencyKey: `test:${input.delivery}:${guildId}:${context.discordUserId}:${request.id}`,
        correlationId: request.id,
        guildId,
        userId: context.discordUserId,
        deliverAt: queuedAt,
      });
      return {
        success: true,
        data: { status: 'QUEUED', delivery: input.delivery, referenceId: request.id },
        requestId: request.id,
      };
    },
  });

  const enqueueVerificationSetup = async (
    request: FastifyRequest,
    requiredOperation: 'SETUP' | 'REPAIR' | 'RESEND' | null,
  ) => {
    const { guildId } = GuildParamsSchema.parse(request.params);
    const input = VerificationSetupRequestSchema.parse(request.body);
    const context = request.authContext;
    if (context === undefined) throw new TypeError('Authenticated route is missing auth context.');
    if (requiredOperation !== null && input.operation !== requiredOperation) {
      throw new AppError({
        code: 'ONBOARDING_SETUP_OPERATION_MISMATCH',
        message: `This endpoint requires the ${requiredOperation} operation.`,
        statusCode: 400,
      });
    }
    if (dependencies.onboardingQueue === undefined) {
      throw new AppError({
        code: 'ONBOARDING_QUEUE_UNAVAILABLE',
        message: 'Verification setup is temporarily unavailable.',
        statusCode: 503,
      });
    }
    const resources = await resourcesFor(guildId);
    if (
      (input.channel.strategy === 'CREATE' || input.restrictedChannelIds.length > 0) &&
      !resources.bot.canManageChannels
    ) {
      throw new AppError({
        code: 'ONBOARDING_MANAGE_CHANNELS_REQUIRED',
        message: 'The bot needs Manage Channels for this verification setup.',
        statusCode: 409,
      });
    }
    if (
      (input.verifiedRole.strategy === 'CREATE' || input.unverifiedRole?.strategy === 'CREATE') &&
      !resources.bot.canManageRoles
    ) {
      throw new AppError({
        code: 'ONBOARDING_MANAGE_ROLES_REQUIRED',
        message: 'The bot needs Manage Roles for this verification setup.',
        statusCode: 409,
      });
    }
    if (
      input.channel.strategy === 'EXISTING' &&
      !resources.channels.some(
        (channel) => channel.id === input.channel.channelId && channel.canManage,
      )
    ) {
      throw new AppError({
        code: 'ONBOARDING_CHANNEL_NOT_MANAGEABLE',
        message: 'The selected verification channel is unavailable or not manageable.',
        statusCode: 409,
      });
    }
    for (const role of [input.verifiedRole, input.unverifiedRole].filter(
      (selection) => selection !== null && selection.strategy === 'EXISTING',
    )) {
      if (
        role === null ||
        !resources.roles.some((candidate) => candidate.id === role.roleId && candidate.assignable)
      ) {
        throw new AppError({
          code: 'ONBOARDING_ROLE_NOT_ASSIGNABLE',
          message: 'A selected verification role is unavailable or not assignable.',
          statusCode: 409,
        });
      }
    }
    if (
      input.channel.categoryId !== null &&
      !resources.categories.some(
        (category) => category.id === input.channel.categoryId && category.canManage,
      )
    ) {
      throw new AppError({
        code: 'ONBOARDING_CATEGORY_NOT_MANAGEABLE',
        message: 'The selected category is unavailable or not manageable.',
        statusCode: 409,
      });
    }
    if (
      input.restrictedChannelIds.some(
        (channelId) =>
          !resources.channels.some((channel) => channel.id === channelId && channel.canManage),
      )
    ) {
      throw new AppError({
        code: 'ONBOARDING_RESTRICTED_CHANNEL_NOT_MANAGEABLE',
        message: 'A selected restricted channel is unavailable or not manageable.',
        statusCode: 409,
      });
    }
    const pending =
      input.operation === 'DRY_RUN'
        ? await repository.get(guildId)
        : await repository.beginVerificationSetup(input, guildId, actor(request));
    try {
      await dependencies.onboardingQueue.enqueueOnboarding({
        job: 'onboarding.verification-setup',
        idempotencyKey: `verification-setup:${guildId}:${request.id}`,
        correlationId: request.id,
        guildId,
        userId: context.discordUserId,
        deliverAt: new Date().toISOString(),
        pendingVersion: pending.version,
        request: input,
      });
    } catch (error) {
      if (input.operation !== 'DRY_RUN') {
        await repository.failVerificationSetup(
          guildId,
          pending.version,
          actor(request),
          'The verification setup job could not be queued.',
          false,
        );
      }
      throw error;
    }
    return {
      success: true,
      data: {
        status: input.operation === 'DRY_RUN' ? 'DRY_RUN_QUEUED' : 'SETUP_QUEUED',
        pendingVersion: pending.version,
        referenceId: request.id,
      },
      requestId: request.id,
    };
  };

  app.post('/v1/guilds/:guildId/onboarding/setup-verification', {
    preHandler: [authenticate, write],
    config: { rateLimit: { max: 2, timeWindow: 60_000, ban: 0 } },
    schema: { tags: ['onboarding'], security: [{ apiKey: [] }] },
    handler: (request) => enqueueVerificationSetup(request, null),
  });

  app.post('/v1/guilds/:guildId/onboarding/repair-verification', {
    preHandler: [authenticate, write],
    config: { rateLimit: { max: 2, timeWindow: 60_000, ban: 0 } },
    schema: { tags: ['onboarding'], security: [{ apiKey: [] }] },
    handler: (request) => enqueueVerificationSetup(request, 'REPAIR'),
  });

  app.post('/v1/guilds/:guildId/onboarding/resend-verification', {
    preHandler: [authenticate, write],
    config: { rateLimit: { max: 2, timeWindow: 60_000, ban: 0 } },
    schema: { tags: ['onboarding'], security: [{ apiKey: [] }] },
    handler: (request) => enqueueVerificationSetup(request, 'RESEND'),
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
        if (route.path.endsWith('/welcome')) {
          const welcome = WelcomeUpdateSchema.parse(input);
          requireValidResources(
            validateWelcomeResources(welcome.config, await resourcesFor(guildId)),
          );
        } else if (route.path.endsWith('/goodbye')) {
          const goodbye = GoodbyeUpdateSchema.parse(input);
          requireValidResources(
            validateGoodbyeResources(goodbye.config, await resourcesFor(guildId)),
          );
        } else if (route.path.endsWith('/roles')) {
          const roles = AutoRoleUpdateSchema.parse(input);
          requireValidResources(
            validateAutoRoleResources(roles.config, await resourcesFor(guildId)),
          );
        }
        return {
          success: true,
          data: await route.update(input, guildId, request),
          requestId: request.id,
        };
      },
    });
  }
};
