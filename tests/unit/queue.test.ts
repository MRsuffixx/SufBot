import { describe, expect, it } from 'vitest';
import { QueueName, createQueueIdentity } from '@sufbot/queue';

describe('BullMQ queue identity', () => {
  it('keeps the namespace in the supported key prefix instead of the queue name', () => {
    const identity = createQueueIdentity('sufbot', QueueName.Audit);

    expect(identity).toEqual({ name: 'audit', prefix: 'sufbot' });
    expect(identity.name).not.toContain(':');
  });
});
