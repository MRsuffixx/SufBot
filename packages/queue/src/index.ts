import { Queue, type JobsOptions, type ConnectionOptions } from 'bullmq';
import { z } from 'zod';
import { sha256 } from '@sufbot/shared';

export const QueueName = {
  Audit: 'audit',
  Analytics: 'analytics',
  DiscordNotifications: 'discord-notifications',
  Scheduled: 'scheduled',
  CacheMaintenance: 'cache-maintenance',
  Cleanup: 'cleanup',
  DeadLetter: 'dead-letter',
} as const;

export const AuditJobSchema = z.object({
  idempotencyKey: z.string().min(8).max(128),
  guildId: z.string().regex(/^\d{17,20}$/).optional(),
  auditLogId: z.uuid(),
  requestedAt: z.iso.datetime(),
});

export const AnalyticsJobSchema = z.object({
  idempotencyKey: z.string().min(8).max(128),
  periodStart: z.iso.datetime(),
  periodEnd: z.iso.datetime(),
});

export const CleanupJobSchema = z.object({
  idempotencyKey: z.string().min(8).max(128),
  before: z.iso.datetime(),
  resource: z.enum(['audit-logs', 'sessions', 'access-grants', 'command-usage']),
});

export const DeadLetterJobSchema = z.object({
  sourceQueue: z.string().min(1).max(64),
  sourceJobId: z.string().max(128).optional(),
  jobName: z.string().min(1).max(64),
  payload: z.unknown(),
  error: z.string().max(500),
  failedAt: z.iso.datetime(),
});

export type AuditJob = z.infer<typeof AuditJobSchema>;
export type AnalyticsJob = z.infer<typeof AnalyticsJobSchema>;
export type CleanupJob = z.infer<typeof CleanupJobSchema>;

const connectionFromUrl = (redisUrl: string): ConnectionOptions => {
  const url = new URL(redisUrl);
  const database = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0;
  return {
    host: url.hostname,
    port: url.port === '' ? 6379 : Number(url.port),
    db: Number.isInteger(database) ? database : 0,
    ...(url.username === '' ? {} : { username: decodeURIComponent(url.username) }),
    ...(url.password === '' ? {} : { password: decodeURIComponent(url.password) }),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
};

export type QueueConfig = {
  prefix: string;
  defaultAttempts: number;
  backoffDelayMs: number;
  removeCompletedAfterSeconds: number;
  removeFailedAfterSeconds: number;
};

export const defaultJobOptions = (config: QueueConfig): JobsOptions => ({
  attempts: config.defaultAttempts,
  backoff: { type: 'exponential', delay: config.backoffDelayMs },
  removeOnComplete: { age: config.removeCompletedAfterSeconds, count: 10_000 },
  removeOnFail: { age: config.removeFailedAfterSeconds, count: 50_000 },
});

export class QueueRegistry {
  readonly #queues = new Map<string, Queue>();
  public readonly connection: ConnectionOptions;

  public constructor(
    redisUrl: string,
    private readonly config: QueueConfig,
  ) {
    this.connection = connectionFromUrl(redisUrl);
  }

  public get(name: (typeof QueueName)[keyof typeof QueueName]): Queue {
    const existing = this.#queues.get(name);
    if (existing !== undefined) return existing;
    const queue = new Queue(`${this.config.prefix}:${name}`, {
      connection: this.connection,
      defaultJobOptions: defaultJobOptions(this.config),
    });
    this.#queues.set(name, queue);
    return queue;
  }

  public async enqueueAudit(input: AuditJob): Promise<string> {
    const payload = AuditJobSchema.parse(input);
    const job = await this.get(QueueName.Audit).add('audit.process', payload, {
      jobId: sha256(payload.idempotencyKey),
      deduplication: { id: payload.idempotencyKey },
    });
    return job.id ?? sha256(payload.idempotencyKey);
  }

  public async close(): Promise<void> {
    await Promise.all([...this.#queues.values()].map((queue) => queue.close()));
    this.#queues.clear();
  }
}

export const createWorkerQueueName = (
  prefix: string,
  name: (typeof QueueName)[keyof typeof QueueName],
): string => `${prefix}:${name}`;

