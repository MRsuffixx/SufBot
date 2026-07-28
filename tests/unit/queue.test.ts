import { describe, expect, it } from 'vitest';
import { BillingWorkerPayloadSchema } from '@sufbot/billing';
import { QueueName, createQueueIdentity } from '@sufbot/queue';

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
});
