# Deployment

The deployment unit is five images: web, API, bot, worker, and the one-off migrator. PostgreSQL and
Redis should be managed services or private containers with persistent volumes. A production
deployment requires real Discord credentials and DNS/TLS control; this repository does not contain
them and performs no automatic deployment.

## Release order

1. Back up PostgreSQL and verify migration compatibility.
2. Build every image from the same immutable Git commit.
3. Run the migrator once with `DATABASE_URL`/`DIRECT_DATABASE_URL`.
4. Start or roll API, web, and worker.
5. Roll bot processes while respecting Discord identify concurrency.
6. Confirm `/v1/health`, `/v1/ready`, `/status`, logs, and a development-guild command.
7. Monitor authentication denials, database/Redis errors, queue failures, and latency.

Never run `prisma migrate dev` in production.

Before enabling Member Onboarding, enable Discord's Server Members privileged intent, verify the
bot's effective Manage Roles/Manage Channels and message permissions, confirm the worker consumes
`onboarding-images`, and run setup/captcha/role/message checks in an owned test guild. Redis must be
private and authenticated; captcha creation intentionally fails closed during Redis outages.

## Coolify

Create a Docker Compose resource from the repository and production override. Configure these
services:

| Service          | Public                 | Health                              |
| ---------------- | ---------------------- | ----------------------------------- |
| web              | `sufbot.tr` → 3000     | `/status`                           |
| api              | `api.sufbot.tr` → 3001 | `/v1/health`; readiness `/v1/ready` |
| bot              | no                     | process health check                |
| worker           | no                     | process health check                |
| migrate          | no, one-off            | successful exit                     |
| PostgreSQL/Redis | never                  | internal provider checks            |

Add all `.env.example` values through Coolify secrets. Replace local URLs with private service DNS
names. Generate independent production cryptographic values and set `NODE_ENV=production`,
`AUTH_TRUST_HOST=true`. Do not use the Compose development password defaults.

Configure the pre-deploy command as the migrator service or run:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --profile application run --rm migrate
```

Only after success, deploy the long-running services. Coolify's reverse proxy must forward HTTPS,
host, and client/proxy addresses consistently. The API trusts one proxy hop; do not place it
directly on an untrusted network with forgeable forwarded headers.

## Reverse proxy and DNS

- `sufbot.tr` and optionally `www.sufbot.tr` terminate TLS and proxy to web.
- `api.sufbot.tr` terminates TLS and proxies to API.
- Redirect HTTP to HTTPS and keep HSTS only after HTTPS is confirmed everywhere.
- Do not proxy PostgreSQL, Redis, bot, worker, or migrator ports.
- Update `config.json` CORS and Auth.js callback registration together when domains change.

## Compose

Development:

```bash
docker compose up -d postgres redis
docker compose --profile application run --rm migrate
docker compose --profile application up -d --build api web bot worker
```

Production:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --profile application config --quiet
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --profile application up -d api web bot worker
```

Use an external secret store and provider-managed private networking for real production. Compose is
a deployment model, not a substitute for firewall, backup, or host-hardening policy.

## Scaling and sharding

Scale web/API/worker replicas only after budgeting PostgreSQL pool connections. Redis is required
for cross-process invalidation and idempotency. For bot scaling, enable sharding configuration and
assign shard ownership through the orchestrator; never start replicas that claim the same manual
shard range. Test Discord session-start limits before rollouts.

## Backups and rollback

Back up and test-restore PostgreSQL. Persist Redis only for operational continuity; PostgreSQL
remains authoritative.

Application rollback is safe only when the earlier version understands the deployed schema. Prefer
backward-compatible expand/contract migrations. If readiness fails:

1. stop the new rollout;
2. preserve logs/request IDs;
3. restore the last compatible images;
4. do not reverse a data migration blindly;
5. use a reviewed forward repair or verified backup restore.

## Secret rotation

Discord client/bot, Auth.js, internal API, database, and Redis credentials can be rotated by
replacing secrets and rolling all consumers. Rotating `ENCRYPTION_KEY` requires the
keyring/re-encryption work described in the OAuth guide or forces every user to re-authenticate
after deleting stored credentials.

## Billing deployment gate

1. Apply all billing migrations and back up PostgreSQL.
2. Keep `billing.enabled=false` while configuring secrets and provider dashboards.
3. Run `pnpm billing:config:check`, `billing:plans:check`, and `billing:providers:check`.
4. Verify the configured Stripe Price and restricted Billing Portal configuration.
5. Expose `POST /v1/webhooks/stripe` and `POST /v1/webhooks/paytr` through HTTPS without
   user-session authentication. Preserve raw bodies and provider retry responses.
6. Deliver signed test-mode Stripe events and, only for an approved PayTR merchant, complete the
   documented merchant-panel test payment/callback.
7. Confirm test and production credentials cannot reach the other environment's data.
8. Verify worker billing queues, DLQ visibility, Redis invalidation, and PostgreSQL backup restore.
9. Enable billing only after legal terms, privacy, refund, tax, and accounting owners approve.

Rotate webhook secrets by coordinating the provider dashboard and deployment rollout. Never reuse
test secrets in production or place them in configuration files.
