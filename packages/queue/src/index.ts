import { Queue, type JobsOptions, type ConnectionOptions } from 'bullmq';
import { z } from 'zod';
import { sha256 } from '@sufbot/shared';
import { BillingWorkerPayloadSchema, type BillingWorkerPayload } from '@sufbot/billing';
import {
  VerificationMemberMigrationSchema,
  VerificationSetupRequestSchema,
} from '@sufbot/onboarding';

export const QueueName = {
  Audit: 'audit',
  Analytics: 'analytics',
  DiscordNotifications: 'discord-notifications',
  Scheduled: 'scheduled',
  CacheMaintenance: 'cache-maintenance',
  Cleanup: 'cleanup',
  DeadLetter: 'dead-letter',
  Billing: 'billing',
  BillingNotifications: 'billing-notifications',
} as const;

export const AuditJobSchema = z.object({
  idempotencyKey: z.string().min(8).max(128),
  guildId: z
    .string()
    .regex(/^\d{17,20}$/)
    .optional(),
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

const DiscordSnowflakeSchema = z.string().regex(/^\d{17,20}$/);
const OnboardingJobBaseSchema = z.object({
  idempotencyKey: z.string().min(8).max(128),
  correlationId: z.string().min(1).max(128),
  guildId: DiscordSnowflakeSchema,
  userId: DiscordSnowflakeSchema,
  deliverAt: z.iso.datetime(),
});

export const OnboardingJobSchema = z.discriminatedUnion('job', [
  OnboardingJobBaseSchema.extend({
    job: z.literal('onboarding.send-welcome-channel'),
    joinedAt: z.iso.datetime(),
    trigger: z.enum(['JOIN', 'VERIFICATION']),
  }).strict(),
  OnboardingJobBaseSchema.extend({
    job: z.literal('onboarding.send-welcome-dm'),
    joinedAt: z.iso.datetime(),
    trigger: z.enum(['JOIN', 'VERIFICATION']),
  }).strict(),
  OnboardingJobBaseSchema.extend({
    job: z.literal('onboarding.assign-join-roles'),
    joinedAt: z.iso.datetime(),
  }).strict(),
  OnboardingJobBaseSchema.extend({
    job: z.literal('onboarding.evaluate-member-conditions'),
    joinedAt: z.iso.datetime(),
    reason: z.enum(['MEMBERSHIP_SCREENING', 'CAPTCHA', 'MANUAL', 'REPAIR']),
  }).strict(),
  OnboardingJobBaseSchema.extend({
    job: z.literal('onboarding.verification-setup'),
    pendingVersion: z.number().int().positive(),
    request: VerificationSetupRequestSchema,
  }).strict(),
  OnboardingJobBaseSchema.extend({
    job: z.literal('onboarding.verification-migrate-members'),
    verifiedRoleId: DiscordSnowflakeSchema,
    unverifiedRoleId: DiscordSnowflakeSchema.nullable(),
    migration: VerificationMemberMigrationSchema,
  }).strict(),
  OnboardingJobBaseSchema.extend({
    job: z.literal('onboarding.test-welcome-channel'),
  }).strict(),
  OnboardingJobBaseSchema.extend({
    job: z.literal('onboarding.test-welcome-dm'),
  }).strict(),
  OnboardingJobBaseSchema.extend({
    job: z.literal('onboarding.test-goodbye-channel'),
  }).strict(),
  OnboardingJobBaseSchema.extend({
    job: z.literal('onboarding.send-goodbye-channel'),
    leftAt: z.iso.datetime(),
    snapshot: z
      .object({
        username: z.string().min(1).max(32),
        displayName: z.string().min(1).max(100),
        globalName: z.string().max(100).nullable(),
        avatarUrl: z.string().url().max(2048),
        accountCreatedAt: z.iso.datetime(),
        joinedAt: z.iso.datetime().nullable(),
        roleNames: z.array(z.string().min(1).max(100)).max(100),
        bot: z.boolean(),
      })
      .strict(),
  }).strict(),
  OnboardingJobBaseSchema.extend({
    job: z.literal('onboarding.delete-message'),
    channelId: DiscordSnowflakeSchema,
    messageId: DiscordSnowflakeSchema,
  }).strict(),
]);

export type AuditJob = z.infer<typeof AuditJobSchema>;
export type AnalyticsJob = z.infer<typeof AnalyticsJobSchema>;
export type CleanupJob = z.infer<typeof CleanupJobSchema>;
export type OnboardingJob = z.infer<typeof OnboardingJobSchema>;

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
    const identity = createQueueIdentity(this.config.prefix, name);
    const queue = new Queue(identity.name, {
      connection: this.connection,
      prefix: identity.prefix,
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

  public async enqueueBilling(input: BillingWorkerPayload): Promise<string> {
    const payload = BillingWorkerPayloadSchema.parse(input);
    let identity: string;
    switch (payload.job) {
      case 'billing.process-provider-event':
      case 'billing.retry-failed-event':
        identity = payload.providerEventRecordId;
        break;
      case 'billing.reconcile-subscription':
        identity = `${payload.subscriptionId}:${payload.reason}`;
        break;
      case 'billing.expire-entitlement':
        identity = `${payload.guildId}:${payload.subscriptionId}:${payload.expectedAt}`;
        break;
      case 'billing.send-payment-failed-notification':
      case 'billing.send-renewal-confirmation':
      case 'billing.send-cancellation-notification':
        identity = `${payload.subscriptionId}:${payload.job}:${payload.correlationId}`;
        break;
      case 'billing.reconcile-stale-subscriptions':
      case 'billing.cleanup-expired-checkouts':
      case 'billing.cleanup-old-event-payloads':
        identity = `${payload.job}:${payload.before}`;
        break;
    }
    const job = await this.get(
      payload.job.includes('notification') ? QueueName.BillingNotifications : QueueName.Billing,
    ).add(payload.job, payload, {
      jobId: sha256(identity),
      deduplication: { id: identity },
      ...(payload.job === 'billing.expire-entitlement'
        ? {
            delay: Math.max(0, new Date(payload.expectedAt).getTime() - Date.now()),
          }
        : {}),
    });
    return job.id ?? sha256(identity);
  }

  public async enqueueOnboarding(input: OnboardingJob): Promise<string> {
    const payload = OnboardingJobSchema.parse(input);
    const job = await this.get(QueueName.DiscordNotifications).add(payload.job, payload, {
      jobId: sha256(payload.idempotencyKey),
      deduplication: { id: payload.idempotencyKey },
      delay: Math.max(0, new Date(payload.deliverAt).getTime() - Date.now()),
    });
    return job.id ?? sha256(payload.idempotencyKey);
  }

  public async close(): Promise<void> {
    await Promise.all([...this.#queues.values()].map((queue) => queue.close()));
    this.#queues.clear();
  }
}

export const createQueueIdentity = (
  prefix: string,
  name: (typeof QueueName)[keyof typeof QueueName],
): { name: (typeof QueueName)[keyof typeof QueueName]; prefix: string } => ({
  name,
  prefix,
});
