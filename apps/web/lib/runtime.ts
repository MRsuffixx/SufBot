import 'server-only';

import { DistributedCache } from '@sufbot/cache';
import { loadAppConfig, loadWebEnvironment } from '@sufbot/config';
import { getPrismaClient } from '@sufbot/database';
import { createLogger } from '@sufbot/logger';

export const appConfig = loadAppConfig();
export const webEnvironment = loadWebEnvironment();
export const webLogger = createLogger(
  { app: 'web', environment: webEnvironment.NODE_ENV, version: '0.1.0' },
  {
    level: appConfig.logging.level,
  },
);
export const prisma = getPrismaClient(webEnvironment.DATABASE_URL);
export const cache = new DistributedCache(webEnvironment.REDIS_URL, {
  namespace: appConfig.cache.namespace,
  localTtlSeconds: appConfig.cache.localTtlSeconds,
  redisTtlSeconds: appConfig.cache.guildConfigTtlSeconds,
  invalidationChannel: appConfig.cache.invalidationChannel,
  logger: webLogger,
});

let cacheConnection: Promise<void> | undefined;
export const ensureCacheConnection = (): Promise<void> => {
  cacheConnection ??= cache.connect().catch((error: unknown) => {
    cacheConnection = undefined;
    throw error;
  });
  return cacheConnection;
};
