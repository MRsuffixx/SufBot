import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DistributedCache } from '@sufbot/cache';
import { createLogger } from '@sufbot/logger';
import { getSafeLocalTestRedisUrl } from './environment.js';

const redisUrl = getSafeLocalTestRedisUrl();
const run = redisUrl === undefined ? describe.skip : describe;
const guildId = '982000000000000010';
const SnapshotSchema = z.object({
  version: z.number().int().positive(),
  entitlements: z.array(z.string()),
});

run('billing Redis cache invariants', () => {
  const namespace = `sufbot:test:billing-integration:${randomUUID()}`;
  const logger = createLogger({ app: 'test', environment: 'test' }, { level: 'silent' });
  let publisher: DistributedCache;
  let subscriber: DistributedCache;

  beforeAll(async () => {
    const options = {
      namespace,
      localTtlSeconds: 60,
      redisTtlSeconds: 60,
      invalidationChannel: `${namespace}:invalidate`,
      logger,
    };
    publisher = new DistributedCache(redisUrl as string, options);
    subscriber = new DistributedCache(redisUrl as string, options);
    await Promise.all([publisher.connect(), subscriber.connect()]);
  });

  afterAll(async () => {
    await Promise.all([publisher.close(), subscriber.close()]);
  });

  it('uses an environment-scoped key and invalidates stale entitlement snapshots over Pub/Sub', async () => {
    expect(subscriber.key(guildId, 'billing:entitlements')).toBe(
      `${namespace}:billing:guild:${guildId}:entitlements:v1`,
    );

    let databaseVersion = 1;
    const load = () =>
      Promise.resolve({
        version: databaseVersion,
        entitlements: ['premium'],
      });
    await expect(
      subscriber.getOrLoad(guildId, 'billing:entitlements', SnapshotSchema, load),
    ).resolves.toMatchObject({ version: 1 });

    let resolveInvalidation: (() => void) | undefined;
    const invalidated = new Promise<void>((resolve) => {
      resolveInvalidation = resolve;
    });
    const unsubscribe = await subscriber.subscribe((event) => {
      if (event.type === 'guild.entitlements.updated' && event.guildId === guildId) {
        resolveInvalidation?.();
      }
    });

    databaseVersion = 2;
    await publisher.publish({
      type: 'guild.entitlements.updated',
      guildId,
      version: databaseVersion,
      timestamp: new Date().toISOString(),
    });

    await Promise.race([
      invalidated,
      new Promise<never>((_resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Redis entitlement invalidation timed out')),
          5_000,
        );
        timeout.unref();
      }),
    ]);
    await expect(
      subscriber.getOrLoad(guildId, 'billing:entitlements', SnapshotSchema, load),
    ).resolves.toMatchObject({ version: 2 });
    await unsubscribe();
  });

  it('fails duplicate retry-safe uniqueness claims closed', async () => {
    const identifier = randomUUID();
    await expect(publisher.claimOnce('billing:job', identifier, 60)).resolves.toBe(true);
    await expect(publisher.claimOnce('billing:job', identifier, 60)).resolves.toBe(false);
  });
});
