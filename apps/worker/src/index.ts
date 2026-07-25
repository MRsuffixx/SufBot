import { Queue, Worker, type Job } from 'bullmq';
import { loadAppConfig, loadWorkerEnvironment } from '@sufbot/config';
import { disconnectPrisma, getPrismaClient } from '@sufbot/database';
import { createLogger } from '@sufbot/logger';
import {
  AuditJobSchema,
  DeadLetterJobSchema,
  QueueName,
  QueueRegistry,
  createQueueIdentity,
} from '@sufbot/queue';
import { sha256 } from '@sufbot/shared';

const env = loadWorkerEnvironment();
const config = loadAppConfig();
const logger = createLogger(
  { app: 'worker', environment: env.NODE_ENV, version: '0.1.0' },
  {
    level: config.logging.level,
    pretty: env.NODE_ENV === 'development' && config.logging.prettyDevelopmentLogs,
  },
);
const prisma = getPrismaClient(env.DATABASE_URL);
const registry = new QueueRegistry(env.REDIS_URL, config.queue);
const deadLetterIdentity = createQueueIdentity(config.queue.prefix, QueueName.DeadLetter);
const auditIdentity = createQueueIdentity(config.queue.prefix, QueueName.Audit);
const deadLetterQueue = new Queue(deadLetterIdentity.name, {
  connection: registry.connection,
  prefix: deadLetterIdentity.prefix,
});

const auditWorker = new Worker(
  auditIdentity.name,
  async (job: Job): Promise<void> => {
    const payload = AuditJobSchema.parse(job.data);
    const existing = await prisma.backgroundJobRecord.findUnique({
      where: {
        queueName_idempotencyKey: {
          queueName: QueueName.Audit,
          idempotencyKey: payload.idempotencyKey,
        },
      },
      select: { status: true },
    });
    if (existing?.status === 'COMPLETED') return;
    const record = await prisma.backgroundJobRecord.upsert({
      where: {
        queueName_idempotencyKey: {
          queueName: QueueName.Audit,
          idempotencyKey: payload.idempotencyKey,
        },
      },
      create: {
        queueName: QueueName.Audit,
        jobName: job.name,
        bullJobId: job.id ?? null,
        idempotencyKey: payload.idempotencyKey,
        status: 'ACTIVE',
        attempts: job.attemptsMade + 1,
        payloadHash: sha256(JSON.stringify(payload)),
        startedAt: new Date(),
      },
      update: {
        bullJobId: job.id ?? null,
        status: 'ACTIVE',
        attempts: job.attemptsMade + 1,
        startedAt: new Date(),
      },
    });
    const auditLog = await prisma.guildAuditLog.findUnique({
      where: { id: payload.auditLogId },
      select: { id: true, guildId: true, action: true, outcome: true },
    });
    if (auditLog === null) throw new Error('AUDIT_LOG_NOT_FOUND');
    if ((auditLog.guildId ?? undefined) !== payload.guildId) {
      throw new Error('AUDIT_LOG_TENANT_MISMATCH');
    }

    logger.info(
      { jobId: job.id, guildId: auditLog.guildId, action: auditLog.action },
      'audit record processed',
    );
    await prisma.backgroundJobRecord.update({
      where: { id: record.id },
      data: { status: 'COMPLETED', completedAt: new Date(), lastError: null, errorCode: null },
    });
  },
  {
    connection: registry.connection,
    prefix: auditIdentity.prefix,
    concurrency: 10,
    lockDuration: 30_000,
  },
);

auditWorker.on('failed', (job, error) => {
  logger.error({ err: error, jobId: job?.id, attemptsMade: job?.attemptsMade }, 'audit job failed');
  if (job === undefined) return;
  const configuredAttempts =
    typeof job.opts.attempts === 'number' ? job.opts.attempts : config.queue.defaultAttempts;
  void prisma.backgroundJobRecord
    .updateMany({
      where: {
        queueName: QueueName.Audit,
        idempotencyKey: String((job.data as { idempotencyKey?: unknown }).idempotencyKey ?? ''),
      },
      data: {
        status: job.attemptsMade >= configuredAttempts ? 'DEAD_LETTERED' : 'FAILED',
        lastError: error.message.slice(0, 500),
        errorCode: 'AUDIT_JOB_FAILED',
      },
    })
    .catch((databaseError: unknown) =>
      logger.error({ err: databaseError }, 'job failure tracking failed'),
    );
  if (job.attemptsMade >= configuredAttempts) {
    const deadLetter = DeadLetterJobSchema.parse({
      sourceQueue: QueueName.Audit,
      sourceJobId: job.id,
      jobName: job.name,
      payload: job.data,
      error: error.message,
      failedAt: new Date().toISOString(),
    });
    void deadLetterQueue.add('dead-letter.capture', deadLetter, {
      jobId: sha256(`${QueueName.Audit}:${job.id ?? 'unknown'}`),
    });
  }
});
auditWorker.on('error', (error) => logger.error({ err: error }, 'audit worker connection error'));

let stopping = false;
const shutdown = async (signal: string): Promise<void> => {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'worker graceful shutdown started');
  const forceExit = setTimeout(() => process.exit(1), 20_000);
  forceExit.unref();
  await auditWorker.close();
  await deadLetterQueue.close();
  await registry.close();
  await disconnectPrisma();
  clearTimeout(forceExit);
  logger.info('worker graceful shutdown completed');
};

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
logger.info({ queues: [QueueName.Audit] }, 'SufBot worker is ready');
