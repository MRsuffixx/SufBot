// src/index.ts
import { Queue } from "bullmq";
import { z } from "zod";
import { sha256 } from "@sufbot/shared";
var QueueName = {
  Audit: "audit",
  Analytics: "analytics",
  DiscordNotifications: "discord-notifications",
  Scheduled: "scheduled",
  CacheMaintenance: "cache-maintenance",
  Cleanup: "cleanup",
  DeadLetter: "dead-letter"
};
var AuditJobSchema = z.object({
  idempotencyKey: z.string().min(8).max(128),
  guildId: z.string().regex(/^\d{17,20}$/).optional(),
  auditLogId: z.uuid(),
  requestedAt: z.iso.datetime()
});
var AnalyticsJobSchema = z.object({
  idempotencyKey: z.string().min(8).max(128),
  periodStart: z.iso.datetime(),
  periodEnd: z.iso.datetime()
});
var CleanupJobSchema = z.object({
  idempotencyKey: z.string().min(8).max(128),
  before: z.iso.datetime(),
  resource: z.enum(["audit-logs", "sessions", "access-grants", "command-usage"])
});
var DeadLetterJobSchema = z.object({
  sourceQueue: z.string().min(1).max(64),
  sourceJobId: z.string().max(128).optional(),
  jobName: z.string().min(1).max(64),
  payload: z.unknown(),
  error: z.string().max(500),
  failedAt: z.iso.datetime()
});
var connectionFromUrl = (redisUrl) => {
  const url = new URL(redisUrl);
  const database = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0;
  return {
    host: url.hostname,
    port: url.port === "" ? 6379 : Number(url.port),
    db: Number.isInteger(database) ? database : 0,
    ...url.username === "" ? {} : { username: decodeURIComponent(url.username) },
    ...url.password === "" ? {} : { password: decodeURIComponent(url.password) },
    ...url.protocol === "rediss:" ? { tls: {} } : {},
    maxRetriesPerRequest: null
  };
};
var defaultJobOptions = (config) => ({
  attempts: config.defaultAttempts,
  backoff: { type: "exponential", delay: config.backoffDelayMs },
  removeOnComplete: { age: config.removeCompletedAfterSeconds, count: 1e4 },
  removeOnFail: { age: config.removeFailedAfterSeconds, count: 5e4 }
});
var QueueRegistry = class {
  constructor(redisUrl, config) {
    this.config = config;
    this.connection = connectionFromUrl(redisUrl);
  }
  config;
  #queues = /* @__PURE__ */ new Map();
  connection;
  get(name) {
    const existing = this.#queues.get(name);
    if (existing !== void 0) return existing;
    const queue = new Queue(`${this.config.prefix}:${name}`, {
      connection: this.connection,
      defaultJobOptions: defaultJobOptions(this.config)
    });
    this.#queues.set(name, queue);
    return queue;
  }
  async enqueueAudit(input) {
    const payload = AuditJobSchema.parse(input);
    const job = await this.get(QueueName.Audit).add("audit.process", payload, {
      jobId: sha256(payload.idempotencyKey),
      deduplication: { id: payload.idempotencyKey }
    });
    return job.id ?? sha256(payload.idempotencyKey);
  }
  async close() {
    await Promise.all([...this.#queues.values()].map((queue) => queue.close()));
    this.#queues.clear();
  }
};
var createWorkerQueueName = (prefix, name) => `${prefix}:${name}`;
export {
  AnalyticsJobSchema,
  AuditJobSchema,
  CleanupJobSchema,
  DeadLetterJobSchema,
  QueueName,
  QueueRegistry,
  createWorkerQueueName,
  defaultJobOptions
};
//# sourceMappingURL=index.js.map