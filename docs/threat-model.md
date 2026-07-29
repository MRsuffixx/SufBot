# Threat model

This document models the initial SufBot foundation. It is a living review aid, not a guarantee of
security.

## Assets

- Discord bot token, OAuth client secret, access/refresh tokens
- Auth.js and service-signing secrets, encryption keys
- guild configuration, permission overrides, audits, user identifiers
- PostgreSQL/Redis credentials and data
- API keys, sessions, subscriptions, feature entitlements
- availability of bot, dashboard, API, and background processing

## Actors and boundaries

Actors include anonymous internet users, authenticated guild users, malicious or compromised guild
administrators, API clients, compromised service credentials, Discord/provider failures, dependency
attackers, and platform operators.

Trust boundaries exist at the reverse proxy, OAuth callback, Discord gateway/REST, public API,
internal signed API, PostgreSQL, Redis/Pub/Sub, BullMQ payloads, CI supply chain, container host,
and operator secret store.

## Threats and controls

| Threat                              | Primary controls                                                                            | Residual risk / action                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| IDOR / cross-guild access           | live server grant, compound tenant keys, scoped queries, negative tests                     | audit every new access path                              |
| OAuth account confusion             | Auth.js state, exact callbacks, provider ID, server-only tokens                             | separate apps per environment                            |
| session theft/fixation              | HTTP-only Secure SameSite cookie, bounded JWT, sessionVersion revocation                    | XSS/browser compromise remains relevant                  |
| CSRF                                | Auth.js state plus same-origin server-action validation                                     | keep proxy origins exact                                 |
| XSS                                 | React escaping, CSP nonce, no raw HTML, restrictive headers                                 | review future rich content/renderers                     |
| SQL/command injection               | Zod, Prisma parameters, no shell from user input                                            | review future raw SQL and file tooling                   |
| SSRF/open redirect                  | fixed Discord endpoints, bounded redirects, URL schemas/timeouts                            | use an egress allowlist for future webhooks              |
| API brute force/abuse               | token format/hash, scopes, rate limits, request/time/size bounds                            | distributed rate limits are needed at large scale        |
| replay/webhook forgery              | HMAC body binding, timestamp, nonce, constant-time compare                                  | protect/rotate shared signing secret                     |
| mass assignment/prototype pollution | strict Zod schemas, explicit Prisma `data` objects                                          | keep object merges away from untrusted data              |
| secret leakage                      | env separation, redaction, encrypted OAuth tokens, safe errors                              | error strings/vendor telemetry need review               |
| cache poisoning/staleness           | namespaced keys, schema validation, versioned Pub/Sub, TTL                                  | Pub/Sub is not durable; TTL bounds misses                |
| queue poisoning/duplicates          | Zod payloads, BullMQ retry policy, durable unique idempotency, DLQ                          | add per-job authorization for future producers           |
| race/TOCTOU                         | live permission refresh, transactions, optimistic versions                                  | Discord state may change during external calls           |
| denial of service                   | rate/body/response/page/time limits, cache stampede lock, bounded pools                     | edge/WAF and distributed quotas still needed             |
| dependency/CI compromise            | exact versions, lockfile integrity, allowlisted install scripts, audits, container builds   | pin Actions by immutable SHA in hardened orgs            |
| database/Redis exposure             | private network, auth, non-root containers                                                  | enable TLS across hosts and host firewalling             |
| malicious operator                  | append-oriented audits, least privilege, immutable releases                                 | database owners can alter data; export audits externally |
| forged payment callback             | Stripe raw-body signature; PayTR constant-time HMAC; strict body limits                     | verify public delivery in each provider test environment |
| checkout redirect spoofing          | redirect is informational; signed event plus stored checkout binding is authoritative       | customer sees processing until reconciliation            |
| cross-guild Premium grant           | fresh Discord authorization, guild-bound checkout/subscription/entitlement                  | support detachment remains a controlled manual process   |
| duplicate/out-of-order billing      | provider event uniqueness, payload hash, optimistic version, provider retrieval             | failed ambiguous events require operator reconciliation  |
| price/currency drift                | integer config, persisted snapshot, immutable Stripe Price check, PayTR approval gate       | tax/accounting policy remains external                   |
| refund/dispute desynchronization    | explicit normalized states and conservative entitlement suspension/revocation               | partial-refund policy requires legal approval            |
| captcha replay/guessing             | signed opaque IDs, guild/user binding, HMAC answer, atomic consume, TTL/attempt/lock limits | local captcha is friction, not proof of identity         |
| cross-guild interaction reuse       | signature binds kind/guild/user/challenge; current setup/member/resource revalidation       | compromised bot token requires rotation and panel repair |
| role hierarchy escalation           | fresh role fetch, managed/everyone/guild/position checks before every mutation              | Discord state can change during a REST request           |
| gateway reconnect duplication       | deterministic event/job IDs and durable `OnboardingEvent` claims                            | uncached partial events can contain less snapshot data   |
| welcome/card spam                   | per-action rate limits, deterministic jobs, bounded delays/concurrency                      | edge Discord rate limits still apply                     |
| remote-image SSRF/bomb              | HTTPS/public pinned DNS, redirect/type/byte/pixel/time/output limits, no user SVG           | deploy worker egress policy for defense in depth         |
| Premium limit bypass                | central entitlement limits at write and bot/worker runtime                                  | configuration remains stored after downgrade but clamped |

## Security invariants

1. A client-supplied guild ID is never sufficient authority.
2. Redis failure must not grant access or accept a replay/duplicate mutation.
3. OAuth and bot tokens never enter browser-visible payloads or ordinary logs/audits.
4. A state change and its audit record commit together.
5. Background retries cannot repeat an effect with the same durable idempotency key.
6. Owner/developer access is based on immutable IDs, not usernames.
7. Errors exposed to users do not include stack traces or arbitrary provider messages.
8. Premium is never activated by a browser redirect, queue replay, or cache value.
9. A PayTR one-time iFrame payment is never represented as automatic recurrence.
10. A captcha answer or expected-answer hash never enters PostgreSQL, queues, logs, or custom IDs.
11. A cached onboarding value never bypasses current member, Discord permission, role, or plan
    checks.

## Abuse cases reviewed

- Editing a form/URL from guild A to guild B: rejected by refreshed grant and scoped database
  access.
- Replaying a signed internal request: rejected by nonce claim.
- Double-clicking a settings save: rejected by mutation idempotency claim.
- Sending unknown module/config fields: rejected by strict schemas/allowlists.
- Forging platform ownership with the username `mrsuffix`: impossible; only immutable configured
  Discord IDs are accepted.
- Disabling a Discord command permission in the UI but invoking directly: runtime precondition still
  evaluates policy.
- Poisoning a cached guild configuration: cached values are schema-validated; database fallback is
  authoritative.
- Replacing a captcha after one wrong answer: the failure budget persists for the lockout window.
- Supplying an internal/private background URL: rejected before connection and again after every
  redirect; the request is pinned to a vetted public DNS answer.

## Residual risks and planned work

- Add an external append-only audit sink and alerting before high-assurance commercial operation.
- Replace process-local API rate limits with edge/distributed quotas at horizontal scale.
- Implement encryption-key IDs and online OAuth credential rotation.
- Complete runtime evaluation of all stored Discord role/channel command overrides.
- Add full API-key issuance/revocation administration with step-up authentication.
- Add SAST, secret scanning, SBOM/provenance signing, and immutable action SHA policy in the hosting
  organization.
- Conduct an independent penetration test before handling paid entitlements or materially sensitive
  guild data.

Review this model for every new module, external webhook, file upload, payment integration, or
privileged background job.
