# Captcha security

Captcha answers are never stored in PostgreSQL, logs, custom IDs, or queue payloads. The bot creates
cryptographically random challenge IDs and answers using Node's cryptographic RNG. Redis stores only
an HMAC-SHA-256 expected-answer value, mode, remaining attempts, and button progress.

Keys are environment, guild, user, and challenge scoped:

```text
sufbot:{environment}:verification:{guildId}:{userId}:{challengeId}
sufbot:{environment}:verification-lock:{guildId}:{userId}
sufbot:{environment}:verification-failures:{guildId}:{userId}
```

Challenges expire in 2–5 minutes, are bound to the clicking user and guild, and are consumed
atomically. A consumed marker rejects concurrent/replayed success. Failure budgets persist across
challenge replacement for the lockout window. Per-user start cooldowns and per-guild generation
limits fail closed when Redis is unavailable. HMAC comparison is constant-time in the application;
Redis scripts perform atomic consume/decrement/CAS operations.

Modes are image text (ambiguous characters excluded), arithmetic, reverse modal text, and a button
sequence. Image captchas are generated in memory with fixed dimensions, bounded input/output, a
three-second Sharp timeout, and no filesystem artifact. Exhaustion locks; automatic kick/ban is
disabled. Success is durably recorded before a deterministic role-reconciliation job is queued.

Rotate the Discord bot token by repairing/re-sending verification panels because panel and challenge
signatures are domain-separated from that secret. Never inspect Redis values in ordinary support
work or copy them into an incident ticket.
