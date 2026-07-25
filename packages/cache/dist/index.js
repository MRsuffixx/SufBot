// src/index.ts
import { Redis } from "ioredis";
import { z } from "zod";
var InvalidationSchema = z.object({
  type: z.literal("guild.config.updated"),
  guildId: z.string().regex(/^\d{17,20}$/),
  module: z.string().min(1).max(64).optional(),
  version: z.number().int().positive(),
  timestamp: z.iso.datetime()
});
var DistributedCache = class {
  constructor(redisUrl, options) {
    this.options = options;
    this.#redis = new Redis(redisUrl, {
      lazyConnect: true,
      enableReadyCheck: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 5e3,
      commandTimeout: 2e3,
      retryStrategy: (attempt) => Math.min(attempt * 250, 3e3)
    });
    this.#redis.on("error", (error) => {
      this.options.logger.warn({ err: error }, "Redis cache error; database fallback remains active");
    });
  }
  options;
  #local = /* @__PURE__ */ new Map();
  #inflight = /* @__PURE__ */ new Map();
  #metrics = {
    localHits: 0,
    redisHits: 0,
    misses: 0,
    loadErrors: 0
  };
  #redis;
  async connect() {
    if (this.#redis.status === "wait") await this.#redis.connect();
  }
  get metrics() {
    return { ...this.#metrics };
  }
  key(guildId, segment = "config") {
    return `${this.options.namespace}:guild:${guildId}:${segment}:v1`;
  }
  async getOrLoad(guildId, segment, schema, loader) {
    const key = this.key(guildId, segment);
    const local = this.#local.get(key);
    if (local !== void 0 && local.expiresAt > Date.now()) {
      const parsed = schema.safeParse(JSON.parse(local.value));
      if (parsed.success) {
        this.#metrics.localHits += 1;
        return parsed.data;
      }
      this.#local.delete(key);
    }
    try {
      const cached = await this.#redis.get(key);
      if (cached !== null) {
        const parsed = schema.safeParse(JSON.parse(cached));
        if (parsed.success) {
          this.#metrics.redisHits += 1;
          this.#setLocal(key, cached);
          return parsed.data;
        }
        await this.#redis.del(key);
      }
    } catch (error) {
      this.options.logger.warn({ err: error, key }, "Redis read failed");
    }
    const existing = this.#inflight.get(key);
    if (existing !== void 0) return existing;
    this.#metrics.misses += 1;
    const pending = loader().then(async (value) => {
      const validated = schema.parse(value);
      const serialized = JSON.stringify(validated);
      this.#setLocal(key, serialized);
      try {
        await this.#redis.set(key, serialized, "EX", this.options.redisTtlSeconds);
      } catch (error) {
        this.options.logger.warn({ err: error, key }, "Redis write failed");
      }
      return validated;
    }).catch((error) => {
      this.#metrics.loadErrors += 1;
      throw error;
    }).finally(() => this.#inflight.delete(key));
    this.#inflight.set(key, pending);
    return pending;
  }
  async invalidate(guildId, module) {
    const segment = module === void 0 ? "config" : `module:${module}`;
    const key = this.key(guildId, segment);
    this.#local.delete(key);
    try {
      await this.#redis.del(key);
    } catch (error) {
      this.options.logger.warn({ err: error, key }, "Redis invalidation failed");
    }
  }
  async publish(event) {
    const validated = InvalidationSchema.parse(event);
    await this.invalidate(validated.guildId, validated.module);
    try {
      await this.#redis.publish(this.options.invalidationChannel, JSON.stringify(validated));
    } catch (error) {
      this.options.logger.warn({ err: error }, "Redis invalidation publish failed");
    }
  }
  async subscribe(handler) {
    const subscriber = this.#redis.duplicate({ maxRetriesPerRequest: null });
    subscriber.on("error", (error) => {
      this.options.logger.warn({ err: error }, "Redis invalidation subscriber error");
    });
    await subscriber.connect();
    await subscriber.subscribe(this.options.invalidationChannel);
    subscriber.on("message", (_channel, raw) => {
      const parsed = InvalidationSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        this.options.logger.warn({ issues: parsed.error.issues }, "Invalid cache event rejected");
        return;
      }
      const event = {
        type: parsed.data.type,
        guildId: parsed.data.guildId,
        version: parsed.data.version,
        timestamp: parsed.data.timestamp,
        ...parsed.data.module === void 0 ? {} : { module: parsed.data.module }
      };
      void this.invalidate(event.guildId, event.module).then(() => handler(event));
    });
    return async () => {
      await subscriber.unsubscribe(this.options.invalidationChannel);
      subscriber.disconnect();
    };
  }
  async ping() {
    try {
      return await this.#redis.ping() === "PONG";
    } catch {
      return false;
    }
  }
  async claimOnce(scope, identifier, ttlSeconds) {
    const key = `${this.options.namespace}:${scope}:${identifier}`;
    try {
      return await this.#redis.set(key, "1", "EX", ttlSeconds, "NX") === "OK";
    } catch (error) {
      this.options.logger.error({ err: error, scope }, "Redis uniqueness claim failed closed");
      return false;
    }
  }
  async close() {
    this.#local.clear();
    if (this.#redis.status !== "end") await this.#redis.quit();
  }
  #setLocal(key, value) {
    const maxEntries = this.options.maxLocalEntries ?? 1e4;
    if (this.#local.size >= maxEntries) {
      const oldest = this.#local.keys().next().value;
      if (oldest !== void 0) this.#local.delete(oldest);
    }
    this.#local.set(key, {
      value,
      expiresAt: Date.now() + this.options.localTtlSeconds * 1e3
    });
  }
};
export {
  DistributedCache
};
//# sourceMappingURL=index.js.map