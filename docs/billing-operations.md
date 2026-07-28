# Billing operations

## Safe diagnostics

```bash
pnpm billing:config:check
pnpm billing:providers:check
pnpm billing:plans:check
pnpm billing:stripe:check
pnpm billing:paytr:check
pnpm billing:events:failed
pnpm billing:test
pnpm billing:test:webhooks
pnpm billing:test:integration
```

Provider diagnostics print capability booleans and reason codes, never secrets. A disabled
deployment is a valid safe state. When billing is enabled, provider diagnostics fail if no enabled
provider is ready.

`billing:test:integration` is fail-closed to loopback PostgreSQL and Redis. It creates or reuses the
dedicated `sufbot_billing_test` database, deploys checked-in migrations, rebuilds workspace package
outputs, and serializes shared-database fixtures. It never accepts the configured remote
`TEST_DATABASE_URL`.

Reconciliation defaults to read-only:

```bash
pnpm billing:reconcile --subscription=<internal-uuid>
pnpm billing:reconcile --subscription=<internal-uuid> --apply
```

Dry-run retrieves and prints normalized provider state without mutation. `--apply` is
environment-aware, performs authoritative reconciliation, writes audit state, and invalidates
entitlement caches. It never initiates a charge.

## Worker and incident handling

Billing jobs validate shared payload schemas, have deterministic BullMQ IDs, bounded exponential
backoff, durable attempt records, and DLQ capture. Expiration jobs retrieve Stripe state before
changing access. PayTR manual entitlements expire only at the period end established by a verified
callback. Notification failure cannot roll back billing.

For a failed event:

1. record request/correlation and provider event IDs;
2. inspect the sanitized failure in billing administration;
3. verify provider state in its merchant dashboard;
4. run reconciliation in dry-run mode;
5. use `--apply` only after the provider state is understood;
6. never edit payment status or entitlement rows manually.

Staff may suspend an effective paid entitlement with an explicit reason, confirmation, optimistic
version, and audit record. Restoration is not a manual `ACTIVE` toggle: use provider reconciliation
after verifying the provider state. Billing risk blocks carry database-enforced creator/revoker
actor lineage.

Back up PostgreSQL and test restores. Redis is operational cache/queue infrastructure, not the
financial source of truth. Rotate provider secrets in the provider dashboard and deployment secret
store, roll all consumers, then verify a signed test event. Do not place secrets in command
arguments, tickets, or logs.
