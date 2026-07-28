import type { DistributedCache } from '@sufbot/cache';
import type { BillingProvider, BillingProviderName } from '@sufbot/billing';
import type { AppConfig, ApiEnvironment } from '@sufbot/config';
import type { PrismaClient } from '@sufbot/database/generated';
import type { Logger } from '@sufbot/logger';

export type ApiAuthContext = {
  kind: 'api-key';
  userId: string;
  discordUserId: string;
  apiKeyId: string;
  guildId?: string;
  scopes: ReadonlySet<string>;
};

export type ApiDependencies = {
  config: AppConfig;
  env: ApiEnvironment;
  prisma: PrismaClient;
  cache: DistributedCache;
  logger: Logger;
  billingProviders: ReadonlyMap<BillingProviderName, BillingProvider>;
};

declare module 'fastify' {
  interface FastifyRequest {
    authContext?: ApiAuthContext;
    correlationId: string;
  }
}
