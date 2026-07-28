# Billing security

## Threat assessment

| Threat                               | Control                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| Forged Stripe webhook                | exact raw body, official SDK signature verification, endpoint secret                       |
| Forged PayTR callback                | documented HMAC, constant-time compare, strict fields                                      |
| Replay / duplicate / order inversion | unique provider event ID, payload hash, optimistic version, provider retrieval             |
| Price/currency manipulation          | validated integer config, immutable Stripe Price check, stored checkout snapshots          |
| Guild substitution / IDOR            | current server-side Discord grant, installed-guild check, compound binding                 |
| Success redirect spoofing            | cookie-bound polling; only provider reconciliation changes entitlements                    |
| Double subscription / checkout       | PostgreSQL partial unique indexes and transaction guards                                   |
| Duplicate charge                     | provider idempotency keys; no PayTR merchant-initiated recurrence                          |
| Provider timeout ambiguity           | no automatic charge retry; authoritative retrieval required                                |
| Redis poisoning/outage               | schema/version/TTL plus PostgreSQL fallback                                                |
| Queue replay                         | Zod payloads, deterministic job IDs, durable job records, bounded retry/DLQ                |
| Internal/admin forgery               | immutable Discord allowlists, explicit billing role, CSRF, reason/confirmation/idempotency |
| Integration test crossover           | loopback-only, test-named database guard and isolated local migration runner               |
| Secret/log leakage                   | server-only env, Pino redaction, sanitized provider errors, minimal payload summary        |
| Test/prod crossover                  | checkout and event environment binding; Stripe livemode and PayTR test mode checks         |

No raw PAN, CVV, magnetic-stripe data, or unrestricted card credentials are accepted. PayTR billing
contact fields are sent directly to its hosted flow and are not persisted as payment credentials.
Full provider webhook bodies are not logged or retained; only hashes and minimal identifiers remain.

## Review outcome

Critical controls are present for callback authenticity, guild tenancy, event idempotency, money
integrity, state transitions, cache failure, and admin actions. Production remains blocked until
provider credentials, Stripe Price, portal restrictions, public callback reachability, merchant
PayTR capabilities, legal terms, and an independent security review are supplied and verified.
