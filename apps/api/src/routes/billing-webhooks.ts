import type { FastifyInstance } from 'fastify';
import { BillingProviderEventService } from '@sufbot/billing';
import { AppError } from '@sufbot/shared';
import type { MetricsRegistry } from '../metrics.js';
import type { ApiDependencies } from '../types.js';

const STRIPE_WEBHOOK_BODY_LIMIT_BYTES = 256 * 1024;
const PAYTR_CALLBACK_BODY_LIMIT_BYTES = 64 * 1024;

export const registerBillingWebhookRoutes = async (
  app: FastifyInstance,
  dependencies: ApiDependencies,
  metrics: MetricsRegistry,
): Promise<void> => {
  const events = new BillingProviderEventService(
    dependencies.prisma,
    dependencies.config,
    dependencies.billingProviders,
    dependencies.cache,
    dependencies.billingQueue?.enqueueBilling.bind(dependencies.billingQueue),
  );

  await app.register(async (webhooks) => {
    webhooks.removeContentTypeParser('application/json');
    webhooks.addContentTypeParser(
      'application/json',
      {
        parseAs: 'buffer',
        bodyLimit: STRIPE_WEBHOOK_BODY_LIMIT_BYTES,
      },
      (_request, body, done) => done(null, body),
    );
    webhooks.addContentTypeParser(
      'application/x-www-form-urlencoded',
      {
        parseAs: 'buffer',
        bodyLimit: PAYTR_CALLBACK_BODY_LIMIT_BYTES,
      },
      (_request, body, done) => done(null, body),
    );

    webhooks.post(
      '/v1/webhooks/stripe',
      {
        bodyLimit: STRIPE_WEBHOOK_BODY_LIMIT_BYTES,
        config: {
          rateLimit: {
            max: 300,
            timeWindow: 60_000,
            ban: 0,
          },
        },
      },
      async (request, reply) => {
        if (!Buffer.isBuffer(request.body)) {
          throw new AppError({
            code: 'STRIPE_RAW_BODY_REQUIRED',
            message: 'Stripe webhook body must be sent as application/json.',
            statusCode: 415,
          });
        }
        metrics.increment('sufbot_billing_webhook_received_total', {
          provider: 'stripe',
        });
        try {
          const result = await events.ingestWebhook('STRIPE', {
            rawBody: request.body,
            headers: request.headers,
            receivedAt: new Date(),
            correlationId: request.correlationId,
          });
          if (result.duplicate) {
            metrics.increment('sufbot_billing_webhook_duplicate_total', {
              provider: 'stripe',
            });
          }
          return reply.status(200).send({ received: true });
        } catch (error) {
          if (
            error instanceof AppError &&
            (error.code === 'STRIPE_SIGNATURE_INVALID' || error.code === 'STRIPE_SIGNATURE_MISSING')
          ) {
            metrics.increment('sufbot_billing_webhook_invalid_total', {
              provider: 'stripe',
            });
          }
          throw error;
        }
      },
    );

    webhooks.post(
      '/v1/webhooks/paytr',
      {
        bodyLimit: PAYTR_CALLBACK_BODY_LIMIT_BYTES,
        config: {
          rateLimit: {
            max: 300,
            timeWindow: 60_000,
            ban: 0,
          },
        },
      },
      async (request, reply) => {
        if (!Buffer.isBuffer(request.body)) {
          throw new AppError({
            code: 'PAYTR_RAW_BODY_REQUIRED',
            message: 'PayTR callback body must be sent as application/x-www-form-urlencoded.',
            statusCode: 415,
          });
        }
        metrics.increment('sufbot_billing_webhook_received_total', {
          provider: 'paytr',
        });
        try {
          const result = await events.ingestWebhook('PAYTR', {
            rawBody: request.body,
            headers: request.headers,
            receivedAt: new Date(),
            correlationId: request.correlationId,
          });
          if (result.duplicate) {
            metrics.increment('sufbot_billing_webhook_duplicate_total', {
              provider: 'paytr',
            });
          }
          return reply.status(200).type('text/plain; charset=utf-8').send('OK');
        } catch (error) {
          if (
            error instanceof AppError &&
            (error.code === 'PAYTR_CALLBACK_HASH_INVALID' ||
              error.code === 'PAYTR_ENVIRONMENT_MISMATCH')
          ) {
            metrics.increment('sufbot_billing_webhook_invalid_total', {
              provider: 'paytr',
            });
          }
          throw error;
        }
      },
    );
  });
};
