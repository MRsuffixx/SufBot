import Fastify, { LogController, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { ZodError } from 'zod';
import {
  AppError,
  ValidationError,
  createId,
  isAppError,
  sha256,
  toSafeError,
} from '@sufbot/shared';
import { appendAuditLog } from '@sufbot/database';
import { registerSystemRoutes } from './routes/system.js';
import { registerUserRoutes } from './routes/users.js';
import { registerGuildRoutes } from './routes/guilds.js';
import { registerInternalRoutes } from './routes/internal.js';
import { MetricsRegistry } from './metrics.js';
import type { ApiDependencies } from './types.js';

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export const buildApi = async (dependencies: ApiDependencies): Promise<FastifyInstance> => {
  const app = Fastify({
    logger: false,
    trustProxy: 1,
    bodyLimit: dependencies.config.server.bodyLimitBytes,
    requestTimeout: dependencies.config.server.requestTimeoutMs,
    connectionTimeout: dependencies.config.server.requestTimeoutMs,
    requestIdHeader: 'x-request-id',
    genReqId: () => createId('req'),
    logController: new LogController({ disableRequestLogging: true }),
  });
  const metrics = new MetricsRegistry();

  await app.register(cors, {
    origin: (origin, callback) => {
      if (origin === undefined || dependencies.config.server.corsAllowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(
          new AppError({
            code: 'CORS_ORIGIN_DENIED',
            message: 'Origin is not allowed.',
            statusCode: 403,
          }),
          false,
        );
      }
    },
    credentials: false,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'authorization',
      'content-type',
      'x-request-id',
      'x-correlation-id',
      'x-sufbot-timestamp',
      'x-sufbot-nonce',
      'x-sufbot-signature',
    ],
    maxAge: 600,
  });
  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
  if (dependencies.config.security.rateLimits.enabled) {
    await app.register(rateLimit, {
      global: true,
      max: dependencies.config.security.rateLimits.maxRequests,
      timeWindow: dependencies.config.security.rateLimits.windowSeconds * 1000,
      ban: 5,
      keyGenerator: (request) => request.ip,
    });
  }
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'SufBot API',
        description: 'Versioned public and internal API for the SufBot platform.',
        version: '0.1.0',
      },
      servers: [{ url: dependencies.config.application.apiUrl }],
      components: {
        securitySchemes: {
          apiKey: { type: 'http', scheme: 'bearer', bearerFormat: 'SufBot API key' },
        },
      },
    },
  });
  if (dependencies.config.server.openApiEnabled && dependencies.env.NODE_ENV !== 'production') {
    await app.register(swaggerUi, { routePrefix: '/documentation' });
  }

  app.decorateRequest('correlationId', '');
  app.addHook('onRequest', async (request) => {
    const incoming = request.headers['x-correlation-id'];
    request.correlationId =
      typeof incoming === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(incoming)
        ? incoming
        : request.id;
  });
  app.addHook('onResponse', async (request, reply) => {
    metrics.increment('sufbot_http_requests_total', {
      method: request.method,
      route: request.routeOptions.url ?? 'unknown',
      status: reply.statusCode,
    });
    dependencies.logger.info(
      {
        requestId: request.id,
        correlationId: request.correlationId,
        method: request.method,
        route: request.routeOptions.url,
        statusCode: reply.statusCode,
        durationMs: reply.elapsedTime,
      },
      'request completed',
    );
  });
  app.addHook('onSend', async (_request, _reply, payload) => {
    if (typeof payload === 'string' && Buffer.byteLength(payload) > MAX_RESPONSE_BYTES) {
      throw new AppError({
        code: 'RESPONSE_TOO_LARGE',
        message: 'Response exceeded the configured size limit.',
        statusCode: 500,
        expose: false,
      });
    }
    return payload;
  });

  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({
      success: false,
      error: { code: 'ROUTE_NOT_FOUND', message: 'Route was not found.', requestId: request.id },
    }),
  );
  app.setErrorHandler((error, request, reply) => {
    const normalized =
      error instanceof ZodError
        ? new ValidationError('Request validation failed.', {
            issues: error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          })
        : error;
    const statusCode = isAppError(normalized) ? normalized.statusCode : 500;
    if (statusCode === 401 || statusCode === 403) {
      const params =
        typeof request.params === 'object' && request.params !== null
          ? (request.params as { guildId?: unknown })
          : {};
      const guildId =
        typeof params.guildId === 'string' && /^\d{17,20}$/.test(params.guildId)
          ? params.guildId
          : undefined;
      const auth = request.authContext;
      void appendAuditLog(dependencies.prisma, {
        ...(guildId === undefined ? {} : { guildId }),
        ...(auth === undefined
          ? {}
          : {
              actorUserId: auth.userId,
              actorDiscordId: auth.discordUserId,
            }),
        action: 'api.authorization.failed',
        resourceType: 'ApiRoute',
        ...(request.routeOptions.url === undefined
          ? {}
          : { resourceId: request.routeOptions.url }),
        requestId: request.id,
        outcome: 'FAILURE',
        failureReason: isAppError(normalized) ? normalized.code : 'AUTHORIZATION_FAILURE',
        ipAddressHash: sha256(`${dependencies.env.WEBHOOK_SIGNING_SECRET}:${request.ip}`),
        ...(request.headers['user-agent'] === undefined
          ? {}
          : { userAgent: request.headers['user-agent'] }),
      }).catch((auditError: unknown) => {
        dependencies.logger.warn(
          { err: auditError, requestId: request.id },
          'failed authorization audit could not be persisted',
        );
      });
    }
    dependencies.logger.error(
      {
        requestId: request.id,
        correlationId: request.correlationId,
        err: normalized,
        errorCode: isAppError(normalized) ? normalized.code : 'INTERNAL_ERROR',
        statusCode,
      },
      'request failed',
    );
    return reply.status(statusCode).send(toSafeError(normalized, request.id));
  });

  await registerSystemRoutes(app, dependencies, metrics);
  await registerUserRoutes(app, dependencies);
  await registerGuildRoutes(app, dependencies);
  await registerInternalRoutes(app, dependencies);
  return app;
};
