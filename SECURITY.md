# Security policy

SufBot handles Discord OAuth credentials and multi-tenant configuration. Treat every authorization,
session, API, database, cache, and queue change as security-sensitive. This policy does not claim
that the project is immune to vulnerabilities.

## Reporting a vulnerability

Do not open a public issue containing exploit details, credentials, guild data, or personal
information. Use the repository owner's GitHub private vulnerability reporting/security advisory
channel. Include:

- affected commit and component;
- reproduction steps with sanitized data;
- impact and tenant boundary involved;
- logs or request IDs with all secrets removed;
- any suggested mitigation.

The maintainer will acknowledge, triage, coordinate a fix, and publish disclosure details when
affected operators have had a reasonable opportunity to update. Do not test against guilds or
infrastructure you do not own.

## Supported versions

Until stable releases are tagged, only the current `main` branch receives security fixes. Production
operators should deploy immutable revisions and subscribe to dependency and repository security
alerts.

## Implemented controls

- Every dashboard and API guild operation resolves current server-side access and scopes the
  database query by the requested guild ID.
- Discord OAuth access/refresh tokens are AES-256-GCM encrypted at rest and never sent to browser
  JavaScript.
- Sessions use HTTP-only, SameSite cookies, production `Secure` cookies, bounded lifetime, and a
  database `sessionVersion` kill switch.
- Dashboard mutations validate origin, schema, tenant access, and a Redis-backed idempotency key
  before transactional writes.
- Internal API requests bind timestamp, nonce, method, path, and body hash with HMAC, constant-time
  verification, and fail-closed replay claims.
- API keys are stored as SHA-256 hashes, checked for status/expiry, and constrained by explicit
  scopes and optional guild binding.
- Fastify and Next.js apply restrictive security headers, CSP, request limits, pagination bounds,
  timeouts, CORS allowlists, and rate limiting.
- Prisma parameterization prevents ordinary SQL injection; sensitive multi-step writes and their
  audit records share transactions.
- Logs and audit values redact credential-shaped fields. IP addresses are stored only as
  secret-salted hashes in API failure audits.
- Redis keys are namespaced and bounded by TTL. Queue payloads are validated; retryable work uses
  unique idempotency keys and dead-letter tracking.
- Containers run as non-root with dropped capabilities and read-only application filesystems.
  PostgreSQL and Redis share an internal network.
- Exact package versions and a lockfile are committed. CI runs high-severity dependency audits and
  validates every container build.

## Operator requirements

- Store production secrets in the deployment platform's encrypted secret store, not Git, Compose
  files, images, logs, or `config.json`.
- Use independent random values for every secret and environment. Rotate Discord, Auth.js, internal
  API, database, Redis, and encryption credentials after suspected exposure.
- Restrict PostgreSQL and Redis to private networks and require authentication/TLS where traffic
  crosses hosts.
- Terminate TLS at a trusted reverse proxy, forward only trusted proxy headers, and keep the
  production origin/CORS values exact.
- Enable GitHub secret scanning and push protection, Dependabot alerts, protected branches, required
  CI checks, signed releases, and least-privilege deployment tokens.
- Back up PostgreSQL with encrypted, tested restores. Preserve append-only audit retention
  consistent with policy and applicable law.
- Apply migrations before new application processes and monitor readiness/error rates during
  rollout.

## Secret response

1. Revoke the exposed credential at its authority.
2. Replace it in the secret store and roll all consumers.
3. Increment affected user `sessionVersion` values for session incidents.
4. Search access/audit logs by the incident window and request IDs.
5. Rotate downstream credentials when reuse or lateral movement is possible.
6. Document the timeline without copying raw secret values into the incident record.

See [the threat model](docs/threat-model.md) for assumptions and residual risks.
