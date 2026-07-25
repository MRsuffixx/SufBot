import { ConnectionOptions, Queue, JobsOptions } from 'bullmq';
import { z } from 'zod';

declare const QueueName: {
    readonly Audit: "audit";
    readonly Analytics: "analytics";
    readonly DiscordNotifications: "discord-notifications";
    readonly Scheduled: "scheduled";
    readonly CacheMaintenance: "cache-maintenance";
    readonly Cleanup: "cleanup";
    readonly DeadLetter: "dead-letter";
};
declare const AuditJobSchema: z.ZodObject<{
    idempotencyKey: z.ZodString;
    guildId: z.ZodOptional<z.ZodString>;
    auditLogId: z.ZodUUID;
    requestedAt: z.ZodISODateTime;
}, z.core.$strip>;
declare const AnalyticsJobSchema: z.ZodObject<{
    idempotencyKey: z.ZodString;
    periodStart: z.ZodISODateTime;
    periodEnd: z.ZodISODateTime;
}, z.core.$strip>;
declare const CleanupJobSchema: z.ZodObject<{
    idempotencyKey: z.ZodString;
    before: z.ZodISODateTime;
    resource: z.ZodEnum<{
        "audit-logs": "audit-logs";
        sessions: "sessions";
        "access-grants": "access-grants";
        "command-usage": "command-usage";
    }>;
}, z.core.$strip>;
declare const DeadLetterJobSchema: z.ZodObject<{
    sourceQueue: z.ZodString;
    sourceJobId: z.ZodOptional<z.ZodString>;
    jobName: z.ZodString;
    payload: z.ZodUnknown;
    error: z.ZodString;
    failedAt: z.ZodISODateTime;
}, z.core.$strip>;
type AuditJob = z.infer<typeof AuditJobSchema>;
type AnalyticsJob = z.infer<typeof AnalyticsJobSchema>;
type CleanupJob = z.infer<typeof CleanupJobSchema>;
type QueueConfig = {
    prefix: string;
    defaultAttempts: number;
    backoffDelayMs: number;
    removeCompletedAfterSeconds: number;
    removeFailedAfterSeconds: number;
};
declare const defaultJobOptions: (config: QueueConfig) => JobsOptions;
declare class QueueRegistry {
    #private;
    private readonly config;
    readonly connection: ConnectionOptions;
    constructor(redisUrl: string, config: QueueConfig);
    get(name: (typeof QueueName)[keyof typeof QueueName]): Queue;
    enqueueAudit(input: AuditJob): Promise<string>;
    close(): Promise<void>;
}
declare const createWorkerQueueName: (prefix: string, name: (typeof QueueName)[keyof typeof QueueName]) => string;

export { type AnalyticsJob, AnalyticsJobSchema, type AuditJob, AuditJobSchema, type CleanupJob, CleanupJobSchema, DeadLetterJobSchema, type QueueConfig, QueueName, QueueRegistry, createWorkerQueueName, defaultJobOptions };
