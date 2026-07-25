import { z } from 'zod';
import { beforeEach, describe, expect, it } from 'vitest';
import { DistributedCache } from '@sufbot/cache';
import { createLogger } from '@sufbot/logger';

const redisState = {
  values: new Map<string, string>(),
  published: [] as Array<{ channel: string; value: string }>,
  failReads: false,
};

class FakeRedis {
  public status = 'wait';

  public on(): this {
    return this;
  }

  public connect(): Promise<void> {
    this.status = 'ready';
    return Promise.resolve();
  }

  public get(key: string): Promise<string | null> {
    if (redisState.failReads) return Promise.reject(new Error('redis unavailable'));
    return Promise.resolve(redisState.values.get(key) ?? null);
  }

  public set(
    key: string,
    value: string,
    _expiryMode: string,
    _ttl: number,
    condition?: string,
  ): Promise<string | null> {
    if (condition === 'NX' && redisState.values.has(key)) return Promise.resolve(null);
    redisState.values.set(key, value);
    return Promise.resolve('OK');
  }

  public del(key: string): Promise<number> {
    return Promise.resolve(redisState.values.delete(key) ? 1 : 0);
  }

  public publish(channel: string, value: string): Promise<number> {
    redisState.published.push({ channel, value });
    return Promise.resolve(1);
  }

  public ping(): Promise<string> {
    return Promise.resolve('PONG');
  }

  public duplicate(): FakeRedis {
    return new FakeRedis();
  }

  public subscribe(): Promise<number> {
    return Promise.resolve(1);
  }

  public unsubscribe(): Promise<number> {
    return Promise.resolve(1);
  }

  public disconnect(): void {
    this.status = 'end';
  }

  public quit(): Promise<string> {
    this.status = 'end';
    return Promise.resolve('OK');
  }
}

const ValueSchema = z.object({ version: z.number().int().positive() });

const createCache = () =>
  new DistributedCache(
    'redis://localhost:6379/0',
    {
      namespace: 'test',
      localTtlSeconds: 60,
      redisTtlSeconds: 60,
      invalidationChannel: 'test:invalidate',
      logger: createLogger({ app: 'test', environment: 'test' }, { level: 'silent' }),
    },
    new FakeRedis() as never,
  );

describe('distributed cache', () => {
  beforeEach(() => {
    redisState.values.clear();
    redisState.published.length = 0;
    redisState.failReads = false;
  });

  it('coalesces concurrent loads and invalidates local and Redis state', async () => {
    const cache = createCache();
    let loads = 0;
    const loader = async () => {
      loads += 1;
      await Promise.resolve();
      return { version: loads };
    };

    const [left, right] = await Promise.all([
      cache.getOrLoad('123456789012345678', 'config', ValueSchema, loader),
      cache.getOrLoad('123456789012345678', 'config', ValueSchema, loader),
    ]);
    expect(left).toEqual({ version: 1 });
    expect(right).toEqual({ version: 1 });
    expect(loads).toBe(1);

    await cache.invalidate('123456789012345678');
    await expect(
      cache.getOrLoad('123456789012345678', 'config', ValueSchema, loader),
    ).resolves.toEqual({ version: 2 });
    expect(loads).toBe(2);
    await cache.close();
  });

  it('falls back to the database loader when Redis reads fail', async () => {
    redisState.failReads = true;
    const cache = createCache();
    await expect(
      cache.getOrLoad('123456789012345678', 'config', ValueSchema, () =>
        Promise.resolve({ version: 4 }),
      ),
    ).resolves.toEqual({ version: 4 });
    expect(cache.metrics.misses).toBe(1);
    await cache.close();
  });

  it('publishes a validated versioned invalidation event', async () => {
    const cache = createCache();
    await cache.publish({
      type: 'guild.config.updated',
      guildId: '123456789012345678',
      module: 'moderation',
      version: 3,
      timestamp: '2026-07-25T10:00:00.000Z',
    });
    expect(redisState.published).toHaveLength(1);
    expect(redisState.published[0]?.channel).toBe('test:invalidate');
    await cache.close();
  });
});
