import { describe, expect, it } from 'vitest';
import { loadAppConfig, type ApiEnvironment } from '@sufbot/config';
import { createLogger } from '@sufbot/logger';
import type { DistributedCache } from '@sufbot/cache';
import type { PrismaClient } from '@sufbot/database/generated';
import { buildApi } from '../../apps/api/src/app.js';
import {
  PaytrBillingProvider,
  StripeBillingProvider,
  type BillingProvider,
  type BillingProviderName,
} from '@sufbot/billing';

const config = loadAppConfig({ environment: 'test', reload: true });
const env: ApiEnvironment = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://sufbot:test@localhost:5432/sufbot_test',
  REDIS_URL: 'redis://localhost:6379/1',
  INTERNAL_API_SECRET: 'i'.repeat(32),
  WEBHOOK_SIGNING_SECRET: 'w'.repeat(32),
  PAYTR_IFRAME_ENABLED: false,
  PAYTR_RECURRING_ENABLED: false,
  PAYTR_CARD_STORAGE_ENABLED: false,
  PAYTR_APPROVED_CURRENCIES: [],
};

const createDependencies = () => ({
  config: {
    ...config,
    security: {
      ...config.security,
      rateLimits: { ...config.security.rateLimits, enabled: false },
    },
  },
  env,
  prisma: {} as PrismaClient,
  cache: {
    metrics: { localHits: 0, redisHits: 0, misses: 0, loadErrors: 0 },
    ping: () => Promise.resolve(true),
  } as unknown as DistributedCache,
  logger: createLogger({ app: 'test', environment: 'test' }, { level: 'silent' }),
  billingProviders: new Map(),
});

describe('Fastify API boundary', () => {
  it('returns a minimal liveness response', async () => {
    const app = await buildApi(createDependencies());
    const response = await app.inject({ method: 'GET', url: '/v1/health' });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-request-id']).toMatch(/^req_[a-f0-9]{32}$/);
    expect(response.json()).toMatchObject({
      status: 'ok',
      service: 'sufbot-api',
    });
  });

  it('rejects unauthenticated public API access with a safe envelope', async () => {
    const app = await buildApi(createDependencies());
    const response = await app.inject({ method: 'GET', url: '/v1/users/me' });
    await app.close();

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: 'AUTHENTICATION_REQUIRED' },
    });
  });

  it('does not disclose unknown internal routes', async () => {
    const app = await buildApi(createDependencies());
    const response = await app.inject({
      method: 'GET',
      url: '/v1/internal/does-not-exist',
    });
    await app.close();

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: 'ROUTE_NOT_FOUND' },
    });
  });

  it('reports dependency unavailability without claiming readiness', async () => {
    const dependencies = createDependencies();
    dependencies.prisma = {
      $queryRaw: () => Promise.reject(new Error('database unavailable')),
    } as unknown as PrismaClient;
    dependencies.cache = {
      metrics: { localHits: 0, redisHits: 0, misses: 0, loadErrors: 0 },
      ping: () => Promise.resolve(false),
    } as unknown as DistributedCache;
    const app = await buildApi(dependencies);
    const response = await app.inject({ method: 'GET', url: '/v1/ready' });
    await app.close();

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      status: 'not_ready',
      dependencies: { database: false, redis: false },
    });
  });

  it('rejects forged Stripe and PayTR machine callbacks before database processing', async () => {
    const stripe = new StripeBillingProvider({
      config,
      environment: 'test',
      secretKey: 'sk_test_api_boundary',
      webhookSecret: 'whsec_api_boundary',
      priceId: 'price_api_boundary',
    });
    const paytr = new PaytrBillingProvider({
      config,
      environment: 'test',
      merchantId: '123456',
      merchantKey: 'merchant-key-value',
      merchantSalt: 'salt-value',
      callbackUrl: 'https://api.example.test/v1/webhooks/paytr',
    });
    const dependencies = createDependencies();
    dependencies.billingProviders = new Map<BillingProviderName, BillingProvider>([
      ['STRIPE', stripe],
      ['PAYTR', paytr],
    ]);
    const app = await buildApi(dependencies);
    const stripeResponse = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/stripe',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 't=1,v1=forged',
      },
      payload: '{"type":"invoice.paid"}',
    });
    const paytrResponse = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/paytr',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload:
        'merchant_oid=SFB11111111222243338444555555555555&status=success&total_amount=400&hash=forged-forged-forged&test_mode=1&payment_type=card&currency=USD&payment_amount=400',
    });
    await app.close();
    expect(stripeResponse.statusCode).toBe(400);
    expect(stripeResponse.json()).toMatchObject({
      error: { code: 'STRIPE_SIGNATURE_INVALID' },
    });
    expect(paytrResponse.statusCode).toBe(400);
    expect(paytrResponse.json()).toMatchObject({
      error: { code: 'PAYTR_CALLBACK_HASH_INVALID' },
    });
  });
});
