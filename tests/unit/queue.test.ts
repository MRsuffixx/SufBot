import { describe, expect, it } from 'vitest';
import { BillingWorkerPayloadSchema } from '@sufbot/billing';
import {
  CleanupJobSchema,
  OnboardingJobSchema,
  QueueName,
  createQueueIdentity,
} from '@sufbot/queue';

describe('BullMQ queue identity', () => {
  it('keeps the namespace in the supported key prefix instead of the queue name', () => {
    const identity = createQueueIdentity('sufbot', QueueName.Audit);

    expect(identity).toEqual({ name: 'audit', prefix: 'sufbot' });
    expect(identity.name).not.toContain(':');
  });

  it('uses dedicated billing queues and rejects malformed financial jobs', () => {
    expect(createQueueIdentity('sufbot:test', QueueName.Billing)).toEqual({
      name: 'billing',
      prefix: 'sufbot:test',
    });
    expect(
      BillingWorkerPayloadSchema.parse({
        job: 'billing.reconcile-subscription',
        subscriptionId: '11111111-2222-4333-8444-555555555555',
        correlationId: 'req_11111111111111111111111111111111',
        reason: 'stale-provider-state',
      }),
    ).toMatchObject({ job: 'billing.reconcile-subscription' });
    expect(
      BillingWorkerPayloadSchema.safeParse({
        job: 'billing.paytr-renewal-attempt',
        subscriptionId: '11111111-2222-4333-8444-555555555555',
        correlationId: 'req_11111111111111111111111111111111',
      }).success,
    ).toBe(false);
  });

  it('validates bounded, tenant-bound onboarding delivery jobs', () => {
    expect(
      OnboardingJobSchema.safeParse({
        job: 'onboarding.send-welcome-channel',
        idempotencyKey: 'welcome:tenant:user:join',
        correlationId: 'join-correlation',
        guildId: '12345678901234567',
        userId: '22345678901234567',
        joinedAt: '2026-07-29T00:00:00.000Z',
        trigger: 'JOIN',
        deliverAt: '2026-07-29T00:00:10.000Z',
      }).success,
    ).toBe(true);
    expect(
      OnboardingJobSchema.safeParse({
        job: 'onboarding.delete-message',
        idempotencyKey: 'delete:tenant:message',
        correlationId: 'delete-correlation',
        guildId: '12345678901234567',
        userId: '22345678901234567',
        channelId: '32345678901234567',
        messageId: '42345678901234567',
        deliverAt: 'not-a-date',
      }).success,
    ).toBe(false);
  });

  it('accepts only declared retention cleanup resources', () => {
    const scheduled = {
      idempotencyKey: 'onboarding-retention-scheduled',
      before: '2026-07-29T00:00:00.000Z',
      resource: 'onboarding-events',
    };
    expect(CleanupJobSchema.safeParse(scheduled).success).toBe(true);
    expect(CleanupJobSchema.safeParse({ ...scheduled, resource: 'captcha-answers' }).success).toBe(
      false,
    );
  });
});
