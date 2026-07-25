# Background jobs

`@sufbot/queue` reserves queues for audit processing, analytics, Discord
notifications, scheduled work, cache maintenance, cleanup, and dead letters. The
initial working processor handles audit jobs; the remaining names are extension points,
not disguised implementations.

Producers validate payloads and derive BullMQ job IDs from idempotency keys. The worker
also persists a unique `(queueName, idempotencyKey)` record, so Redis loss/retry cannot
repeat a completed durable effect. Failures use exponential backoff. Exhausted jobs are
recorded as dead-lettered and copied to the dead-letter queue with bounded error text.

Monitor:

- queue depth and oldest waiting age;
- active/failed/dead-letter job counts;
- attempts and processing duration;
- Redis connection errors;
- `BackgroundJobRecord` rows stuck in `ACTIVE`;
- differences between BullMQ and durable status.

Dead-letter replay must be an explicit operator action after the cause is fixed. Reuse
the original idempotency key and verify whether an external side effect already
occurred before resetting status. Never edit queue payload JSON blindly.
