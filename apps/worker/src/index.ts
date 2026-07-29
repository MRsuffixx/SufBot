import { Queue, Worker, type Job } from 'bullmq';
import { DistributedCache, ServiceHeartbeat } from '@sufbot/cache';
import {
  BillingManagementService,
  BillingWorkerPayloadSchema,
  EntitlementService,
  PaytrBillingProvider,
  SubscriptionReconciliationService,
  StripeBillingProvider,
  type BillingProvider,
  type BillingProviderName,
  type BillingWorkerPayload,
} from '@sufbot/billing';
import { loadAppConfig, loadWorkerEnvironment } from '@sufbot/config';
import { disconnectPrisma, getPrismaClient } from '@sufbot/database';
import { createRuntimeLogger } from '@sufbot/logger/runtime';
import {
  AuditJobSchema,
  CleanupJobSchema,
  DeadLetterJobSchema,
  QueueName,
  QueueRegistry,
  WelcomeCardGenerationJobSchema,
  createQueueIdentity,
} from '@sufbot/queue';
import { sha256 } from '@sufbot/shared';
import {
  OnboardingRepository,
  fetchSafeRemoteImage,
  generateWelcomeCard,
} from '@sufbot/onboarding';

const env = loadWorkerEnvironment();
const config = loadAppConfig();
const logger = await createRuntimeLogger(
  { app: 'worker', environment: env.NODE_ENV, version: '0.1.0' },
  {
    level: config.logging.level,
    pretty: env.NODE_ENV === 'development' && config.logging.prettyDevelopmentLogs,
  },
);
const prisma = getPrismaClient(env.DATABASE_URL);
const registry = new QueueRegistry(env.REDIS_URL, config.queue);
const billingCache = new DistributedCache(env.REDIS_URL, {
  namespace: `${config.cache.namespace}:${env.NODE_ENV}`,
  localTtlSeconds: config.cache.localTtlSeconds,
  redisTtlSeconds: config.billing.entitlementCacheTtlSeconds,
  invalidationChannel: config.cache.invalidationChannel,
  logger,
});
const heartbeat = new ServiceHeartbeat(env.REDIS_URL, {
  namespace: `${config.cache.namespace}:${env.NODE_ENV}`,
  service: 'worker',
  logger,
});
const deadLetterIdentity = createQueueIdentity(config.queue.prefix, QueueName.DeadLetter);
const auditIdentity = createQueueIdentity(config.queue.prefix, QueueName.Audit);
const billingIdentity = createQueueIdentity(config.queue.prefix, QueueName.Billing);
const billingNotificationIdentity = createQueueIdentity(
  config.queue.prefix,
  QueueName.BillingNotifications,
);
const cleanupIdentity = createQueueIdentity(config.queue.prefix, QueueName.Cleanup);
const onboardingImageIdentity = createQueueIdentity(
  config.queue.prefix,
  QueueName.OnboardingImages,
);
const cleanupQueue = registry.get(QueueName.Cleanup);
const deadLetterQueue = new Queue(deadLetterIdentity.name, {
  connection: registry.connection,
  prefix: deadLetterIdentity.prefix,
});
const stripeProvider = new StripeBillingProvider({
  config,
  environment: env.NODE_ENV,
  ...(env.STRIPE_SECRET_KEY === undefined ? {} : { secretKey: env.STRIPE_SECRET_KEY }),
  ...(env.STRIPE_WEBHOOK_SECRET === undefined ? {} : { webhookSecret: env.STRIPE_WEBHOOK_SECRET }),
  ...(env.STRIPE_PRICE_ID === undefined ? {} : { priceId: env.STRIPE_PRICE_ID }),
  ...(env.STRIPE_PORTAL_CONFIGURATION_ID === undefined
    ? {}
    : { portalConfigurationId: env.STRIPE_PORTAL_CONFIGURATION_ID }),
});
const paytrProvider = new PaytrBillingProvider({
  config,
  environment: env.NODE_ENV,
  ...(env.PAYTR_MERCHANT_ID === undefined ? {} : { merchantId: env.PAYTR_MERCHANT_ID }),
  ...(env.PAYTR_MERCHANT_KEY === undefined ? {} : { merchantKey: env.PAYTR_MERCHANT_KEY }),
  ...(env.PAYTR_MERCHANT_SALT === undefined ? {} : { merchantSalt: env.PAYTR_MERCHANT_SALT }),
  ...(env.PAYTR_CALLBACK_URL === undefined ? {} : { callbackUrl: env.PAYTR_CALLBACK_URL }),
  iframeCapabilityEnabled: env.PAYTR_IFRAME_ENABLED,
  recurringCapabilityEnabled: env.PAYTR_RECURRING_ENABLED,
  cardStorageCapabilityEnabled: env.PAYTR_CARD_STORAGE_ENABLED,
  approvedCurrencies: env.PAYTR_APPROVED_CURRENCIES,
});
const billingProviders: ReadonlyMap<BillingProviderName, BillingProvider> = new Map<
  BillingProviderName,
  BillingProvider
>([
  ['STRIPE', stripeProvider],
  ['PAYTR', paytrProvider],
]);
const billingManagement = new BillingManagementService(
  prisma,
  config,
  billingProviders,
  billingCache,
);
const subscriptionReconciliation = new SubscriptionReconciliationService(
  prisma,
  config,
  billingCache,
);
const entitlementService = new EntitlementService(prisma, config, billingCache);
const onboardingRepository = new OnboardingRepository(prisma);

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

const billingJobIdempotencyKey = (job: Job): string =>
  job.id ?? sha256(`${job.name}:${JSON.stringify(job.data)}`);

const runRecordedBillingJob = async (
  queueName: string,
  job: Job,
  operation: () => Promise<void>,
): Promise<void> => {
  const idempotencyKey = billingJobIdempotencyKey(job);
  const existing = await prisma.backgroundJobRecord.findUnique({
    where: { queueName_idempotencyKey: { queueName, idempotencyKey } },
    select: { status: true },
  });
  if (existing?.status === 'COMPLETED') return;
  const record = await prisma.backgroundJobRecord.upsert({
    where: { queueName_idempotencyKey: { queueName, idempotencyKey } },
    create: {
      queueName,
      jobName: job.name,
      bullJobId: job.id ?? null,
      idempotencyKey,
      status: 'ACTIVE',
      attempts: job.attemptsMade + 1,
      payloadHash: sha256(JSON.stringify(job.data)),
      startedAt: new Date(),
    },
    update: {
      bullJobId: job.id ?? null,
      status: 'ACTIVE',
      attempts: job.attemptsMade + 1,
      startedAt: new Date(),
    },
  });
  await operation();
  await prisma.backgroundJobRecord.update({
    where: { id: record.id },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      lastError: null,
      errorCode: null,
    },
  });
};

const providerSubscriptionIdFromSummary = (summary: unknown): string | undefined => {
  if (typeof summary !== 'object' || summary === null || !('providerSubscriptionId' in summary)) {
    return undefined;
  }
  const value = (summary as { providerSubscriptionId?: unknown }).providerSubscriptionId;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

const retryProviderEvent = async (
  providerEventRecordId: string,
  correlationId: string,
): Promise<void> => {
  const event = await prisma.billingProviderEvent.findUnique({
    where: { id: providerEventRecordId },
  });
  if (event === null) throw new Error('BILLING_PROVIDER_EVENT_NOT_FOUND');
  if (event.processingStatus === 'PROCESSED' || event.processingStatus === 'IGNORED') return;
  const providerSubscriptionId = providerSubscriptionIdFromSummary(event.payloadSummary);
  if (providerSubscriptionId === undefined) {
    throw new Error('BILLING_PROVIDER_EVENT_REFERENCE_MISSING');
  }
  const subscription = await prisma.guildSubscription.findUnique({
    where: {
      provider_providerSubscriptionId: {
        provider: event.provider,
        providerSubscriptionId,
      },
    },
    select: { id: true },
  });
  if (subscription === null) throw new Error('BILLING_SUBSCRIPTION_MAPPING_NOT_FOUND');
  await billingManagement.reconcileAsSystem({
    subscriptionId: subscription.id,
    requestId: correlationId,
  });
  await prisma.billingProviderEvent.update({
    where: { id: event.id },
    data: {
      processingStatus: 'PROCESSED',
      processedAt: new Date(),
      attemptCount: { increment: 1 },
      failureCode: null,
      lastErrorSanitized: null,
    },
  });
};

const processBillingPayload = async (payload: BillingWorkerPayload): Promise<void> => {
  switch (payload.job) {
    case 'billing.process-provider-event':
    case 'billing.retry-failed-event':
      await retryProviderEvent(payload.providerEventRecordId, payload.correlationId);
      return;
    case 'billing.reconcile-subscription':
      await billingManagement.reconcileAsSystem({
        subscriptionId: payload.subscriptionId,
        requestId: payload.correlationId,
      });
      return;
    case 'billing.reconcile-stale-subscriptions': {
      const stale = await prisma.guildSubscription.findMany({
        where: {
          provider: 'STRIPE',
          providerSubscriptionId: { not: null },
          status: {
            in: [
              'INCOMPLETE',
              'ACTIVE',
              'PAST_DUE',
              'GRACE_PERIOD',
              'SUSPENDED',
              'CANCELLED',
              'DISPUTED',
            ],
          },
          OR: [
            { providerUpdatedAt: null },
            { providerUpdatedAt: { lt: new Date(payload.before) } },
          ],
        },
        orderBy: { providerUpdatedAt: 'asc' },
        take: 200,
        select: { id: true },
      });
      await Promise.all(
        stale.map((subscription) =>
          registry.enqueueBilling({
            job: 'billing.reconcile-subscription',
            subscriptionId: subscription.id,
            correlationId: payload.correlationId,
            reason: 'stale-provider-state',
          }),
        ),
      );
      return;
    }
    case 'billing.expire-entitlement':
      {
        const subscription = await prisma.guildSubscription.findUnique({
          where: { id: payload.subscriptionId },
        });
        if (subscription === null || subscription.guildId !== payload.guildId) {
          throw new Error('BILLING_ENTITLEMENT_EXPIRY_TENANT_MISMATCH');
        }
        if (subscription.provider === 'PAYTR') {
          const expectedAt = new Date(payload.expectedAt);
          if (
            subscription.currentPeriodEnd === null ||
            subscription.currentPeriodEnd.getTime() !== expectedAt.getTime() ||
            expectedAt > new Date()
          ) {
            return;
          }
          await subscriptionReconciliation.applyState({
            subscriptionId: subscription.id,
            expectedVersion: subscription.version,
            nextStatus: 'EXPIRED',
            currentPeriodEnd: expectedAt,
            endedAt: expectedAt,
            cancellationStatus: 'CANCELLED',
            cancelAtPeriodEnd: false,
            requestId: payload.correlationId,
            source: 'worker',
            actorType: 'WORKER',
          });
          return;
        }
        await billingManagement.reconcileAsSystem({
          subscriptionId: payload.subscriptionId,
          requestId: payload.correlationId,
        });
      }
      return;
    case 'billing.cleanup-expired-checkouts': {
      const before = new Date(payload.before);
      const expired = await prisma.checkoutSession.findMany({
        where: {
          expiresAt: { lte: before },
          state: { in: ['CREATED', 'PROVIDER_PENDING'] },
        },
        take: 500,
        select: {
          id: true,
          guildId: true,
          subscriptionId: true,
          version: true,
          subscription: { select: { status: true, version: true } },
        },
      });
      for (const checkout of expired) {
        await prisma.$transaction(async (transaction) => {
          const changed = await transaction.checkoutSession.updateMany({
            where: {
              id: checkout.id,
              version: checkout.version,
              state: { in: ['CREATED', 'PROVIDER_PENDING'] },
            },
            data: { state: 'EXPIRED', version: { increment: 1 } },
          });
          if (changed.count !== 1) return;
          if (
            checkout.subscription.status === 'PENDING' ||
            checkout.subscription.status === 'INCOMPLETE'
          ) {
            await transaction.guildSubscription.updateMany({
              where: {
                id: checkout.subscriptionId,
                version: checkout.subscription.version,
                status: { in: ['PENDING', 'INCOMPLETE'] },
              },
              data: {
                status: 'EXPIRED',
                endedAt: before,
                version: { increment: 1 },
              },
            });
          }
          await transaction.billingAuditEvent.create({
            data: {
              actorType: 'WORKER',
              guildId: checkout.guildId,
              subscriptionId: checkout.subscriptionId,
              action: 'billing.checkout.expired',
              requestId: payload.correlationId,
              source: 'worker',
            },
          });
        });
      }
      return;
    }
    case 'billing.cleanup-old-event-payloads':
      await prisma.billingProviderEvent.updateMany({
        where: {
          receivedAt: { lt: new Date(payload.before) },
          processingStatus: { in: ['PROCESSED', 'IGNORED'] },
        },
        data: { payloadSummary: {} },
      });
      return;
    case 'billing.send-payment-failed-notification':
    case 'billing.send-renewal-confirmation':
    case 'billing.send-cancellation-notification': {
      const subscription = await prisma.guildSubscription.findUnique({
        where: { id: payload.subscriptionId },
        select: { purchaserUserId: true, guildId: true },
      });
      if (subscription === null) throw new Error('BILLING_SUBSCRIPTION_NOT_FOUND');
      const notification =
        payload.job === 'billing.send-payment-failed-notification'
          ? {
              title: 'Premium payment failed',
              message:
                'The provider reported a payment failure. Review billing status in the dashboard.',
            }
          : payload.job === 'billing.send-renewal-confirmation'
            ? {
                title: 'Premium renewed',
                message: 'A verified provider event renewed this guild subscription.',
              }
            : {
                title: 'Premium cancellation scheduled',
                message: 'Premium remains available until the verified period end.',
              };
      await prisma.billingNotification.upsert({
        where: {
          eventKey: `${payload.job}:${payload.subscriptionId}:${payload.correlationId}`,
        },
        create: {
          userId: subscription.purchaserUserId,
          guildId: subscription.guildId,
          subscriptionId: payload.subscriptionId,
          eventKey: `${payload.job}:${payload.subscriptionId}:${payload.correlationId}`,
          type: payload.job,
          title: notification.title,
          message: notification.message,
        },
        update: {},
      });
      return;
    }
  }
};

const billingWorker = new Worker(
  billingIdentity.name,
  async (job: Job): Promise<void> => {
    const payload = BillingWorkerPayloadSchema.parse(job.data);
    await runRecordedBillingJob(QueueName.Billing, job, () => processBillingPayload(payload));
  },
  {
    connection: registry.connection,
    prefix: billingIdentity.prefix,
    concurrency: 5,
    lockDuration: 60_000,
  },
);

const billingNotificationWorker = new Worker(
  billingNotificationIdentity.name,
  async (job: Job): Promise<void> => {
    const payload = BillingWorkerPayloadSchema.parse(job.data);
    await runRecordedBillingJob(QueueName.BillingNotifications, job, () =>
      processBillingPayload(payload),
    );
  },
  {
    connection: registry.connection,
    prefix: billingNotificationIdentity.prefix,
    concurrency: 10,
    lockDuration: 30_000,
  },
);

const onboardingImageWorker = new Worker(
  onboardingImageIdentity.name,
  async (job: Job) => {
    const payload = WelcomeCardGenerationJobSchema.parse(job.data);
    const onboarding = await onboardingRepository.get(payload.guildId);
    if (!onboarding.welcomeCardEnabled || onboarding.version !== payload.configurationVersion) {
      throw new Error('WELCOME_CARD_CONFIGURATION_CHANGED');
    }
    const plan = await entitlementService.getGuildLimits(payload.guildId);
    const backgroundUrl =
      plan.limits.customCardBackgrounds > 0 ? onboarding.welcomeCard.backgroundUrl : null;
    const [avatar, background, serverIcon] = await Promise.all([
      fetchSafeRemoteImage(payload.avatarUrl),
      backgroundUrl === null ? Promise.resolve(undefined) : fetchSafeRemoteImage(backgroundUrl),
      onboarding.welcomeCard.showServerIcon && payload.serverIconUrl !== null
        ? fetchSafeRemoteImage(payload.serverIconUrl)
        : Promise.resolve(undefined),
    ]);
    const generated = await generateWelcomeCard({
      config: onboarding.welcomeCard,
      text: payload.text,
      avatar,
      ...(background === undefined ? {} : { background }),
      ...(serverIcon === undefined ? {} : { serverIcon }),
    });
    return {
      dataBase64: generated.buffer.toString('base64'),
      contentType: generated.contentType,
      filename: generated.filename,
    };
  },
  {
    connection: registry.connection,
    prefix: onboardingImageIdentity.prefix,
    concurrency: 2,
    lockDuration: 30_000,
    limiter: { max: 10, duration: 1_000 },
  },
);

const cleanupOnboardingEvents = async (): Promise<number> => {
  const pageSize = 100;
  const deleteBatchSize = 1_000;
  const maximumDeleteBatchesPerGuild = 100;
  let cursor: string | undefined;
  let deletedTotal = 0;

  while (true) {
    const configurations = await prisma.guildOnboardingConfig.findMany({
      orderBy: { guildId: 'asc' },
      take: pageSize,
      ...(cursor === undefined ? {} : { cursor: { guildId: cursor }, skip: 1 }),
      select: { guildId: true },
    });
    if (configurations.length === 0) break;

    for (const onboarding of configurations) {
      const plan = await entitlementService.getGuildLimits(onboarding.guildId);
      const cutoff = new Date(
        Date.now() - plan.limits.moderationHistoryDays * 24 * 60 * 60 * 1_000,
      );
      for (let batch = 0; batch < maximumDeleteBatchesPerGuild; batch += 1) {
        const expired = await prisma.onboardingEvent.findMany({
          where: { guildId: onboarding.guildId, occurredAt: { lt: cutoff } },
          orderBy: { id: 'asc' },
          take: deleteBatchSize,
          select: { id: true },
        });
        if (expired.length === 0) break;
        const deleted = await prisma.onboardingEvent.deleteMany({
          where: { id: { in: expired.map((event) => event.id) } },
        });
        deletedTotal += deleted.count;
        if (expired.length < deleteBatchSize) break;
      }
    }

    cursor = configurations.at(-1)?.guildId;
    if (configurations.length < pageSize || cursor === undefined) break;
  }

  return deletedTotal;
};

const cleanupWorker = new Worker(
  cleanupIdentity.name,
  async (job: Job): Promise<void> => {
    const payload = CleanupJobSchema.parse(job.data);
    await runRecordedBillingJob(QueueName.Cleanup, job, async () => {
      if (payload.resource !== 'onboarding-events') {
        throw new Error('CLEANUP_RESOURCE_UNSUPPORTED');
      }
      const deleted = await cleanupOnboardingEvents();
      logger.info({ resource: payload.resource, deleted }, 'privacy retention cleanup completed');
    });
  },
  {
    connection: registry.connection,
    prefix: cleanupIdentity.prefix,
    concurrency: 1,
    lockDuration: 120_000,
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

const trackRecordedJobFailure = (queueName: string, job: Job | undefined, error: Error): void => {
  logger.error(
    { err: error, queueName, jobId: job?.id, attemptsMade: job?.attemptsMade },
    'recorded background job failed',
  );
  if (job === undefined) return;
  const configuredAttempts =
    typeof job.opts.attempts === 'number' ? job.opts.attempts : config.queue.defaultAttempts;
  const idempotencyKey = billingJobIdempotencyKey(job);
  void prisma.backgroundJobRecord
    .updateMany({
      where: { queueName, idempotencyKey },
      data: {
        status: job.attemptsMade >= configuredAttempts ? 'DEAD_LETTERED' : 'FAILED',
        lastError: error.message.slice(0, 500),
        errorCode: queueName === QueueName.Cleanup ? 'CLEANUP_JOB_FAILED' : 'BILLING_JOB_FAILED',
      },
    })
    .catch((databaseError: unknown) =>
      logger.error({ err: databaseError }, 'billing job failure tracking failed'),
    );
  if (job.attemptsMade >= configuredAttempts) {
    const deadLetter = DeadLetterJobSchema.parse({
      sourceQueue: queueName,
      sourceJobId: job.id,
      jobName: job.name,
      payload: job.data,
      error: error.message,
      failedAt: new Date().toISOString(),
    });
    void deadLetterQueue.add('dead-letter.capture', deadLetter, {
      jobId: sha256(`${queueName}:${job.id ?? 'unknown'}`),
    });
  }
};

billingWorker.on('failed', (job, error) => trackRecordedJobFailure(QueueName.Billing, job, error));
billingNotificationWorker.on('failed', (job, error) =>
  trackRecordedJobFailure(QueueName.BillingNotifications, job, error),
);
cleanupWorker.on('failed', (job, error) => trackRecordedJobFailure(QueueName.Cleanup, job, error));
billingWorker.on('error', (error) =>
  logger.error({ err: error }, 'billing worker connection error'),
);
billingNotificationWorker.on('error', (error) =>
  logger.error({ err: error }, 'billing notification worker connection error'),
);
cleanupWorker.on('error', (error) =>
  logger.error({ err: error }, 'cleanup worker connection error'),
);
onboardingImageWorker.on('failed', (job, error) => {
  logger.warn(
    {
      errorCode: error.message.slice(0, 64),
      jobId: job?.id,
      attemptsMade: job?.attemptsMade,
    },
    'welcome card generation failed',
  );
  if (job === undefined) return;
  const configuredAttempts =
    typeof job.opts.attempts === 'number' ? job.opts.attempts : config.queue.defaultAttempts;
  if (job.attemptsMade >= configuredAttempts) {
    const deadLetter = DeadLetterJobSchema.parse({
      sourceQueue: QueueName.OnboardingImages,
      sourceJobId: job.id,
      jobName: job.name,
      payload: job.data,
      error: 'Welcome card generation failed after bounded retries.',
      failedAt: new Date().toISOString(),
    });
    void deadLetterQueue.add('dead-letter.capture', deadLetter, {
      jobId: sha256(`${QueueName.OnboardingImages}:${job.id ?? 'unknown'}`),
    });
  }
});
onboardingImageWorker.on('error', (error) =>
  logger.error({ err: error }, 'welcome card worker connection error'),
);

let stopping = false;
const shutdown = async (signal: string): Promise<void> => {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'worker graceful shutdown started');
  const forceExit = setTimeout(() => process.exit(1), 20_000);
  forceExit.unref();
  await heartbeat.close();
  await auditWorker.close();
  await billingWorker.close();
  await billingNotificationWorker.close();
  await cleanupWorker.close();
  await onboardingImageWorker.close();
  await billingCache.close();
  await deadLetterQueue.close();
  await registry.close();
  await disconnectPrisma();
  clearTimeout(forceExit);
  logger.info('worker graceful shutdown completed');
};

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
await auditWorker.waitUntilReady();
await billingWorker.waitUntilReady();
await billingNotificationWorker.waitUntilReady();
await cleanupWorker.waitUntilReady();
await onboardingImageWorker.waitUntilReady();
await billingCache.connect();
await heartbeat.start();
const retentionJobKey = `onboarding-retention:${new Date().toISOString().slice(0, 10)}`;
await cleanupQueue.add(
  'cleanup.onboarding-events',
  {
    idempotencyKey: retentionJobKey,
    before: new Date().toISOString(),
    resource: 'onboarding-events',
  },
  {
    jobId: sha256(retentionJobKey),
    deduplication: { id: retentionJobKey },
  },
);
await cleanupQueue.upsertJobScheduler(
  'onboarding-event-retention-v1',
  { every: 24 * 60 * 60 * 1_000 },
  {
    name: 'cleanup.onboarding-events',
    data: {
      idempotencyKey: 'onboarding-retention-scheduled',
      before: new Date().toISOString(),
      resource: 'onboarding-events',
    },
  },
);
logger.info(
  {
    queues: [
      QueueName.Audit,
      QueueName.Billing,
      QueueName.BillingNotifications,
      QueueName.Cleanup,
      QueueName.OnboardingImages,
    ],
  },
  'SufBot worker is ready',
);
