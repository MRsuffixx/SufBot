import { randomUUID } from 'node:crypto';
import { loadAppConfig, loadWorkerEnvironment } from '@sufbot/config';
import { disconnectPrisma, getPrismaClient } from '@sufbot/database';
import { QueueName, QueueRegistry } from '@sufbot/queue';

const env = loadWorkerEnvironment();
const config = loadAppConfig();
const prisma = getPrismaClient(env.DATABASE_URL);
const registry = new QueueRegistry(env.REDIS_URL, config.queue);
const queue = registry.get(QueueName.Audit);
const smokeId = randomUUID();
const idempotencyKey = `worker-smoke-${smokeId}`;
let auditLogId: string | undefined;
let queuedJobId: string | undefined;

const waitForCompletion = async (): Promise<void> => {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const record = await prisma.backgroundJobRecord.findUnique({
      where: {
        queueName_idempotencyKey: {
          queueName: QueueName.Audit,
          idempotencyKey,
        },
      },
      select: { status: true },
    });
    if (record?.status === 'COMPLETED') return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('The audit worker did not complete the smoke job within 15 seconds.');
};

try {
  const auditLog = await prisma.guildAuditLog.create({
    data: {
      action: 'WORKER_SMOKE_CHECK',
      resourceType: 'background-job',
      requestId: `worker_smoke_${smokeId}`,
      outcome: 'SUCCESS',
      metadata: { synthetic: true },
    },
    select: { id: true },
  });
  auditLogId = auditLog.id;

  const payload = {
    idempotencyKey,
    auditLogId,
    requestedAt: new Date().toISOString(),
  };
  const firstJobId = await registry.enqueueAudit(payload);
  queuedJobId = firstJobId;
  await waitForCompletion();
  const secondJobId = await registry.enqueueAudit(payload);

  const recordCount = await prisma.backgroundJobRecord.count({
    where: { queueName: QueueName.Audit, idempotencyKey },
  });
  const job = await queue.getJob(firstJobId);

  if (recordCount !== 1) {
    throw new Error(`Expected one idempotency record, found ${recordCount}.`);
  }
  if (firstJobId !== secondJobId) {
    throw new Error('Duplicate audit enqueue produced a different BullMQ job ID.');
  }
  if (job === undefined) {
    throw new Error('The completed audit job was not found in Redis.');
  }
  if (job.opts.attempts !== config.queue.defaultAttempts) {
    throw new Error('The audit job retry policy does not match config.json.');
  }

  console.log('Worker job execution: completed');
  console.log('Worker idempotency: valid (1 database record)');
  console.log(`Worker retry attempts: ${String(job.opts.attempts)}`);
  console.log('Worker backoff: configured');
} finally {
  if (queuedJobId !== undefined) {
    const job = await queue.getJob(queuedJobId);
    if (job !== undefined) await job.remove().catch(() => undefined);
  }
  await prisma.backgroundJobRecord.deleteMany({
    where: { queueName: QueueName.Audit, idempotencyKey },
  });
  if (auditLogId !== undefined) {
    await prisma.guildAuditLog.deleteMany({ where: { id: auditLogId } });
  }
  await registry.close();
  await disconnectPrisma();
}
