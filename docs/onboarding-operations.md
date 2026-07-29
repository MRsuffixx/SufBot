# Onboarding operations

## Health and repair

Use the onboarding dashboard or `/onboarding status`. `PENDING` means an exclusive setup job owns
the configuration; `PARTIAL` means Discord mutation began but did not complete; `BROKEN` means a
stored resource is absent or setup failed. Inspect the correlation ID and audit/event records,
correct permissions/hierarchy, run a dry-run, then choose Repair. Resources are never deleted
automatically.

## Queues and Redis

Discord delivery jobs use deterministic IDs in `discord-notifications`. Card work uses
`onboarding-images` and is pure/retry-safe. Exhausted jobs go to `dead-letter`; retry only after
confirming current configuration/member/resource state. Never replay a migration or role job by
inventing a new idempotency key.

Redis loss makes captcha creation fail closed. Existing durable verification history remains in
PostgreSQL. Configuration reads fall back to PostgreSQL. After Redis recovery, no captcha is assumed
valid; members start a new challenge.

## Incident checks

Search by guild, request/correlation ID, event type, and time. Verify no answer/hash, token,
session, or full member export entered logs. For suspected role abuse disable automatic
roles/verification, preserve audit records, inspect hierarchy and configuration versions, and repair
before re-enable. For suspected SSRF disable cards/custom backgrounds and review worker egress/DNS
logs.

The logs dashboard and `/analytics` endpoint use plan-bounded history (7 days free, 365 Premium by
default). The worker schedules `cleanup.onboarding-events` every 24 hours and also submits one
initial run when the scheduler is first installed. It resolves each guild's current entitlement,
deletes only that guild's expired onboarding events in bounded batches, records each scheduled job
idempotently, and dead-letters exhausted failures. PostgreSQL backups must be encrypted and
restore-tested; Redis captcha data does not require backup.

Real Discord behavior must be tested only in an owned test guild. Record channel/role/panel IDs and
test results without copying secrets or captcha values.
