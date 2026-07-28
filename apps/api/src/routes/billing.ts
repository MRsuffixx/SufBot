import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  BillingCheckoutService,
  BillingManagementService,
  EntitlementService,
  CancellationRequestSchema,
  CheckoutRequestSchema,
  GuildBillingStatusSchema,
  PaymentHistoryItemSchema,
  ProviderCapabilitiesSchema,
  ResumeRequestSchema,
  configuredPlan,
} from '@sufbot/billing';
import { RateLimitError } from '@sufbot/shared';
import {
  createApiKeyAuthenticator,
  createGuildAccessGuard,
  requireScope,
} from '../authentication.js';
import type { ApiDependencies } from '../types.js';

const GuildParamsSchema = z.object({ guildId: z.string().regex(/^\d{17,20}$/) });
const SubscriptionRequestSchema = z.object({ subscriptionId: z.uuid() }).strict();
const ReconcileRequestSchema = SubscriptionRequestSchema.extend({
  idempotencyKey: z.string().min(8).max(128),
}).strict();

const authContext = (request: FastifyRequest) => {
  if (request.authContext === undefined) throw new TypeError('Auth context missing.');
  return request.authContext;
};

export const registerBillingRoutes = async (
  app: FastifyInstance,
  dependencies: ApiDependencies,
): Promise<void> => {
  const authenticate = createApiKeyAuthenticator(dependencies);
  const guildRead = createGuildAccessGuard(dependencies, 'billing:read');
  const guildWrite = createGuildAccessGuard(dependencies, 'billing:write');
  const management = new BillingManagementService(
    dependencies.prisma,
    dependencies.config,
    dependencies.billingProviders,
    dependencies.cache,
  );
  const checkout = new BillingCheckoutService(
    dependencies.prisma,
    dependencies.config,
    dependencies.billingProviders,
    dependencies.env.NODE_ENV,
  );
  const entitlements = new EntitlementService(
    dependencies.prisma,
    dependencies.config,
    dependencies.cache,
  );

  app.get('/v1/billing/plans', async (request) => {
    const capabilities = await Promise.all(
      [...dependencies.billingProviders.values()].map((provider) => provider.checkCapabilities()),
    );
    return {
      success: true,
      data: {
        plan: configuredPlan(dependencies.config),
        enabled: dependencies.config.billing.enabled,
        providers: capabilities.map((capability) => ProviderCapabilitiesSchema.parse(capability)),
      },
      requestId: request.id,
    };
  });

  app.get('/v1/guilds/:guildId/billing', {
    preHandler: [authenticate, guildRead],
    schema: { tags: ['billing'], security: [{ apiKey: [] }] },
    handler: async (request) => {
      const { guildId } = GuildParamsSchema.parse(request.params);
      return {
        success: true,
        data: GuildBillingStatusSchema.parse(await management.getGuildBillingStatus(guildId)),
        requestId: request.id,
      };
    },
  });

  app.get('/v1/guilds/:guildId/billing/payments', {
    preHandler: [authenticate, guildRead],
    schema: { tags: ['billing'], security: [{ apiKey: [] }] },
    handler: async (request) => {
      const { guildId } = GuildParamsSchema.parse(request.params);
      const payments = await management.listPayments(guildId);
      return {
        success: true,
        data: payments.map((payment) =>
          PaymentHistoryItemSchema.parse({
            ...payment,
            paidAt: payment.paidAt?.toISOString() ?? null,
            createdAt: payment.createdAt.toISOString(),
          }),
        ),
        requestId: request.id,
      };
    },
  });

  app.get('/v1/guilds/:guildId/billing/entitlements', {
    preHandler: [authenticate, guildRead],
    schema: { tags: ['billing'], security: [{ apiKey: [] }] },
    handler: async (request) => {
      const { guildId } = GuildParamsSchema.parse(request.params);
      const [records, limits] = await Promise.all([
        entitlements.listGuildEntitlements(guildId),
        entitlements.getGuildLimits(guildId),
      ]);
      return {
        success: true,
        data: {
          entitlements: records.map((record) => record.key),
          ...limits,
        },
        requestId: request.id,
      };
    },
  });

  app.post('/v1/guilds/:guildId/billing/checkout', {
    preHandler: [authenticate, guildWrite],
    config: { rateLimit: { max: 10, timeWindow: 60_000, ban: 0 } },
    schema: { tags: ['billing'], security: [{ apiKey: [] }] },
    handler: async (request) => {
      const { guildId } = GuildParamsSchema.parse(request.params);
      const input = CheckoutRequestSchema.parse(request.body);
      const context = authContext(request);
      const claimed = await dependencies.cache.claimOnce(
        'billing-checkout-cooldown',
        `${context.userId}:${guildId}`,
        30,
      );
      if (!claimed) throw new RateLimitError('Checkout was requested recently.');
      const result = await checkout.createCheckout({
        userId: context.userId,
        guildId,
        provider: input.provider,
        planCode: input.planCode,
        successUrl: `${dependencies.config.application.websiteUrl}/premium/status`,
        cancelUrl: `${dependencies.config.application.websiteUrl}/premium?checkout=cancelled`,
        requestId: request.id,
        ...(input.billingContact === undefined
          ? {}
          : {
              paytrCustomer: {
                ...input.billingContact,
                userIp: request.ip,
              },
            }),
      });
      return { success: true, data: result, requestId: request.id };
    },
  });

  app.post('/v1/guilds/:guildId/billing/cancel', {
    preHandler: [authenticate, guildWrite],
    schema: { tags: ['billing'], security: [{ apiKey: [] }] },
    handler: async (request) => {
      const { guildId } = GuildParamsSchema.parse(request.params);
      const input = CancellationRequestSchema.parse(request.body);
      const context = authContext(request);
      return {
        success: true,
        data: await management.cancelAtPeriodEnd({
          guildId,
          userId: context.userId,
          ...input,
          requestId: request.id,
        }),
        requestId: request.id,
      };
    },
  });

  app.post('/v1/guilds/:guildId/billing/resume', {
    preHandler: [authenticate, guildWrite],
    schema: { tags: ['billing'], security: [{ apiKey: [] }] },
    handler: async (request) => {
      const { guildId } = GuildParamsSchema.parse(request.params);
      const input = ResumeRequestSchema.parse(request.body);
      const context = authContext(request);
      return {
        success: true,
        data: await management.resume({
          guildId,
          userId: context.userId,
          ...input,
          requestId: request.id,
        }),
        requestId: request.id,
      };
    },
  });

  app.post('/v1/guilds/:guildId/billing/manage', {
    preHandler: [authenticate, guildWrite],
    schema: { tags: ['billing'], security: [{ apiKey: [] }] },
    handler: async (request) => {
      const { guildId } = GuildParamsSchema.parse(request.params);
      const input = SubscriptionRequestSchema.parse(request.body);
      const context = authContext(request);
      const session = await management.createManagementSession({
        guildId,
        userId: context.userId,
        subscriptionId: input.subscriptionId,
        returnUrl: `${dependencies.config.application.websiteUrl}/dashboard/guilds/${guildId}/premium`,
      });
      return {
        success: true,
        data: {
          url: session.url,
          expiresAt: session.expiresAt?.toISOString() ?? null,
        },
        requestId: request.id,
      };
    },
  });

  app.post('/v1/guilds/:guildId/billing/reconcile', {
    preHandler: [authenticate, guildWrite],
    config: { rateLimit: { max: 3, timeWindow: 60_000, ban: 0 } },
    schema: { tags: ['billing'], security: [{ apiKey: [] }] },
    handler: async (request) => {
      requireScope(request, 'billing:reconcile');
      const { guildId } = GuildParamsSchema.parse(request.params);
      const input = ReconcileRequestSchema.parse(request.body);
      const context = authContext(request);
      const claimed = await dependencies.cache.claimOnce(
        'billing-reconcile',
        `${context.userId}:${input.subscriptionId}:${input.idempotencyKey}`,
        300,
      );
      if (!claimed) throw new RateLimitError('Reconciliation was already requested.');
      return {
        success: true,
        data: await management.reconcile({
          guildId,
          userId: context.userId,
          subscriptionId: input.subscriptionId,
          requestId: request.id,
        }),
        requestId: request.id,
      };
    },
  });
};
