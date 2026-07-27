import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { z, type ZodType } from 'zod';
import type { Logger } from '@sufbot/logger';

export type CacheMetrics = {
  localHits: number;
  redisHits: number;
  misses: number;
  loadErrors: number;
};

export type CacheInvalidationEvent = {
  type: 'guild.config.updated';
  guildId: string;
  module?: string;
  version: number;
  timestamp: string;
};

export type ObservableService = 'bot' | 'worker';

export const serviceHeartbeatRegistryKey = (
  namespace: string,
  service: ObservableService,
): string => `${namespace}:runtime:${service}:instances`;

export const serviceHeartbeatKey = (
  namespace: string,
  service: ObservableService,
  instanceId: string,
): string => `${namespace}:runtime:${service}:heartbeat:${instanceId}`;

export class ServiceHeartbeat {
  readonly #instanceId = randomUUID();
  readonly #redis: Redis;
  readonly #startedAt = new Date().toISOString();
  #started = false;
  #timer: NodeJS.Timeout | undefined;

  public constructor(
    redisUrl: string,
    private readonly options: {
      namespace: string;
      service: ObservableService;
      logger: Logger;
      ttlSeconds?: number;
      intervalSeconds?: number;
    },
  ) {
    this.#redis = new Redis(redisUrl, {
      lazyConnect: true,
      enableReadyCheck: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 5_000,
      commandTimeout: 2_000,
      retryStrategy: (attempt: number) => Math.min(attempt * 250, 3_000),
    });
    this.#redis.on('error', (error) => {
      this.options.logger.warn({ err: error, service: this.options.service }, 'heartbeat error');
    });
  }

  public async start(): Promise<void> {
    if (this.#timer !== undefined) return;
    if (this.#redis.status === 'wait') await this.#redis.connect();
    await this.#write();
    this.#started = true;
    const intervalSeconds = this.options.intervalSeconds ?? 10;
    this.#timer = setInterval(() => {
      void this.#write().catch((error: unknown) => {
        this.options.logger.warn(
          { err: error, service: this.options.service },
          'heartbeat update failed',
        );
      });
    }, intervalSeconds * 1000);
    this.#timer.unref();
  }

  public async close(): Promise<void> {
    if (this.#timer !== undefined) {
      clearInterval(this.#timer);
      this.#timer = undefined;
    }
    if (!this.#started) {
      this.#redis.disconnect();
      return;
    }
    if (this.#redis.status !== 'end') {
      const registryKey = serviceHeartbeatRegistryKey(this.options.namespace, this.options.service);
      const heartbeatKey = serviceHeartbeatKey(
        this.options.namespace,
        this.options.service,
        this.#instanceId,
      );
      await this.#redis
        .multi()
        .del(heartbeatKey)
        .zrem(registryKey, this.#instanceId)
        .exec()
        .catch((error: unknown) => {
          this.options.logger.warn(
            { err: error, service: this.options.service },
            'heartbeat cleanup failed',
          );
        });
      await this.#redis.quit().catch(() => this.#redis.disconnect());
    }
    this.#started = false;
  }

  async #write(): Promise<void> {
    const ttlSeconds = this.options.ttlSeconds ?? 30;
    const now = Date.now();
    const registryKey = serviceHeartbeatRegistryKey(this.options.namespace, this.options.service);
    const heartbeatKey = serviceHeartbeatKey(
      this.options.namespace,
      this.options.service,
      this.#instanceId,
    );
    const value = JSON.stringify({
      service: this.options.service,
      instanceId: this.#instanceId,
      processId: process.pid,
      startedAt: this.#startedAt,
      updatedAt: new Date(now).toISOString(),
    });
    await this.#redis
      .multi()
      .set(heartbeatKey, value, 'EX', ttlSeconds)
      .zadd(registryKey, now, this.#instanceId)
      .zremrangebyscore(registryKey, 0, now - ttlSeconds * 1000)
      .expire(registryKey, ttlSeconds * 2)
      .exec();
  }
}

const InvalidationSchema = z.object({
  type: z.literal('guild.config.updated'),
  guildId: z.string().regex(/^\d{17,20}$/),
  module: z.string().min(1).max(64).optional(),
  version: z.number().int().positive(),
  timestamp: z.iso.datetime(),
});

type LocalEntry = { value: string; expiresAt: number };

export class DistributedCache {
  readonly #local = new Map<string, LocalEntry>();
  readonly #inflight = new Map<string, Promise<unknown>>();
  readonly #metrics: CacheMetrics = {
    localHits: 0,
    redisHits: 0,
    misses: 0,
    loadErrors: 0,
  };
  readonly #redis: Redis;

  public constructor(
    redisUrl: string,
    private readonly options: {
      namespace: string;
      localTtlSeconds: number;
      redisTtlSeconds: number;
      invalidationChannel: string;
      logger: Logger;
      maxLocalEntries?: number;
    },
    redisClient?: Redis,
  ) {
    this.#redis =
      redisClient ??
      new Redis(redisUrl, {
        lazyConnect: true,
        enableReadyCheck: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 5_000,
        commandTimeout: 2_000,
        retryStrategy: (attempt: number) => Math.min(attempt * 250, 3_000),
      });
    this.#redis.on('error', (error) => {
      this.options.logger.warn(
        { err: error },
        'Redis cache error; database fallback remains active',
      );
    });
  }

  public async connect(): Promise<void> {
    if (this.#redis.status === 'wait') await this.#redis.connect();
  }

  public get metrics(): Readonly<CacheMetrics> {
    return { ...this.#metrics };
  }

  public key(guildId: string, segment = 'config'): string {
    return `${this.options.namespace}:guild:${guildId}:${segment}:v1`;
  }

  public async getOrLoad<T>(
    guildId: string,
    segment: string,
    schema: ZodType<T>,
    loader: () => Promise<T>,
  ): Promise<T> {
    const key = this.key(guildId, segment);
    const local = this.#local.get(key);
    if (local !== undefined && local.expiresAt > Date.now()) {
      const parsed = schema.safeParse(JSON.parse(local.value) as unknown);
      if (parsed.success) {
        this.#metrics.localHits += 1;
        return parsed.data;
      }
      this.#local.delete(key);
    }

    try {
      const cached = await this.#redis.get(key);
      if (cached !== null) {
        const parsed = schema.safeParse(JSON.parse(cached) as unknown);
        if (parsed.success) {
          this.#metrics.redisHits += 1;
          this.#setLocal(key, cached);
          return parsed.data;
        }
        await this.#redis.del(key);
      }
    } catch (error) {
      this.options.logger.warn({ err: error, key }, 'Redis read failed');
    }

    const existing = this.#inflight.get(key) as Promise<T> | undefined;
    if (existing !== undefined) return existing;

    this.#metrics.misses += 1;
    const pending = loader()
      .then(async (value) => {
        const validated = schema.parse(value);
        const serialized = JSON.stringify(validated);
        this.#setLocal(key, serialized);
        try {
          await this.#redis.set(key, serialized, 'EX', this.options.redisTtlSeconds);
        } catch (error) {
          this.options.logger.warn({ err: error, key }, 'Redis write failed');
        }
        return validated;
      })
      .catch((error: unknown) => {
        this.#metrics.loadErrors += 1;
        throw error;
      })
      .finally(() => this.#inflight.delete(key));
    this.#inflight.set(key, pending);
    return pending;
  }

  public async invalidate(guildId: string, module?: string): Promise<void> {
    const segment = module === undefined ? 'config' : `module:${module}`;
    const key = this.key(guildId, segment);
    this.#local.delete(key);
    try {
      await this.#redis.del(key);
    } catch (error) {
      this.options.logger.warn({ err: error, key }, 'Redis invalidation failed');
    }
  }

  public async publish(event: CacheInvalidationEvent): Promise<void> {
    const validated = InvalidationSchema.parse(event);
    await this.invalidate(validated.guildId, validated.module);
    try {
      await this.#redis.publish(this.options.invalidationChannel, JSON.stringify(validated));
    } catch (error) {
      this.options.logger.warn({ err: error }, 'Redis invalidation publish failed');
    }
  }

  public async subscribe(
    handler: (event: CacheInvalidationEvent) => Promise<void> | void,
  ): Promise<() => Promise<void>> {
    const subscriber = this.#redis.duplicate({ maxRetriesPerRequest: null });
    subscriber.on('error', (error) => {
      this.options.logger.warn({ err: error }, 'Redis invalidation subscriber error');
    });
    await subscriber.connect();
    await subscriber.subscribe(this.options.invalidationChannel);
    subscriber.on('message', (_channel, raw) => {
      const parsed = InvalidationSchema.safeParse(JSON.parse(raw) as unknown);
      if (!parsed.success) {
        this.options.logger.warn({ issues: parsed.error.issues }, 'Invalid cache event rejected');
        return;
      }
      const event: CacheInvalidationEvent = {
        type: parsed.data.type,
        guildId: parsed.data.guildId,
        version: parsed.data.version,
        timestamp: parsed.data.timestamp,
        ...(parsed.data.module === undefined ? {} : { module: parsed.data.module }),
      };
      void this.invalidate(event.guildId, event.module).then(() => handler(event));
    });
    return async () => {
      await subscriber.unsubscribe(this.options.invalidationChannel);
      subscriber.disconnect();
    };
  }

  public async ping(): Promise<boolean> {
    try {
      return (await this.#redis.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  public async claimOnce(scope: string, identifier: string, ttlSeconds: number): Promise<boolean> {
    const key = `${this.options.namespace}:${scope}:${identifier}`;
    try {
      return (await this.#redis.set(key, '1', 'EX', ttlSeconds, 'NX')) === 'OK';
    } catch (error) {
      this.options.logger.error({ err: error, scope }, 'Redis uniqueness claim failed closed');
      return false;
    }
  }

  public async close(): Promise<void> {
    this.#local.clear();
    if (this.#redis.status !== 'end') await this.#redis.quit();
  }

  #setLocal(key: string, value: string): void {
    const maxEntries = this.options.maxLocalEntries ?? 10_000;
    if (this.#local.size >= maxEntries) {
      const oldest = this.#local.keys().next().value as string | undefined;
      if (oldest !== undefined) this.#local.delete(oldest);
    }
    this.#local.set(key, {
      value,
      expiresAt: Date.now() + this.options.localTtlSeconds * 1000,
    });
  }
}
