import { ZodType } from 'zod';
import { Logger } from '@sufbot/logger';

type CacheMetrics = {
    localHits: number;
    redisHits: number;
    misses: number;
    loadErrors: number;
};
type CacheInvalidationEvent = {
    type: 'guild.config.updated';
    guildId: string;
    module?: string;
    version: number;
    timestamp: string;
};
declare class DistributedCache {
    #private;
    private readonly options;
    constructor(redisUrl: string, options: {
        namespace: string;
        localTtlSeconds: number;
        redisTtlSeconds: number;
        invalidationChannel: string;
        logger: Logger;
        maxLocalEntries?: number;
    });
    connect(): Promise<void>;
    get metrics(): Readonly<CacheMetrics>;
    key(guildId: string, segment?: string): string;
    getOrLoad<T>(guildId: string, segment: string, schema: ZodType<T>, loader: () => Promise<T>): Promise<T>;
    invalidate(guildId: string, module?: string): Promise<void>;
    publish(event: CacheInvalidationEvent): Promise<void>;
    subscribe(handler: (event: CacheInvalidationEvent) => Promise<void> | void): Promise<() => Promise<void>>;
    ping(): Promise<boolean>;
    claimOnce(scope: string, identifier: string, ttlSeconds: number): Promise<boolean>;
    close(): Promise<void>;
}

export { type CacheInvalidationEvent, type CacheMetrics, DistributedCache };
