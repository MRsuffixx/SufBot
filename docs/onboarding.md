# Member Onboarding architecture

Member Onboarding is a guild-scoped domain shared by the web dashboard, Fastify API, Discord bot,
BullMQ worker, PostgreSQL, and Redis. It does not use a global singleton configuration and never
selects a Discord resource by name after setup.

## Data and control flow

`GuildOnboardingConfig` owns versioned structured welcome, goodbye, verification, automatic-role,
and card configuration. `MemberVerification` is the durable per-guild/per-user outcome record.
`OnboardingEvent` is the idempotent delivery and analytics journal. Dashboard and API writes require
fresh guild authorization, strict shared schemas, optimistic version checks, a same-origin or
API-key boundary, an audit record in the database transaction, then cache invalidation after commit.

The bot converts Discord gateway events into deterministic BullMQ jobs. Before delivery or role
mutation it reloads current configuration, member presence, channel permissions, role hierarchy, and
current Premium limits. PostgreSQL remains durable; Redis configuration is a bounded cache only.
Failures retry with bounded exponential backoff and exhausted work is copied to dead letter.

## Events

- `guildMemberAdd`: journal join, create/reset verification state, assign join/unverified roles, and
  queue immediate welcome channel/DM delivery when configured.
- `guildMemberUpdate`: detect Membership Screening `pending: true -> false`, persist it, and run the
  central condition evaluator.
- `guildMemberRemove`: journal departure, expire pending verification, remove active captcha state,
  and queue a goodbye using a bounded last-known snapshot.
- `channelDelete`, `roleDelete`, `messageDelete`: compare immutable IDs and mark verification
  resources broken for repair.

The supported condition policies are captcha only, Membership Screening only, either, and both.
Welcome delivery can occur on join, after the condition, or both. Notification failure never rolls
back a successful role or verification transaction.

## Routes and dashboard

API routes live under `/v1/guilds/:guildId/onboarding`, including section PATCH routes, resources,
status, logs, analytics, preview, audited tests, setup, repair, and panel resend. Dashboard pages
live under `/dashboard/guilds/[guildId]/onboarding`.

Free/Premium capacity is resolved by the central billing entitlement service. Writes reject excess
configuration and bot/worker execution clamps saved premium configuration after entitlement
revocation.
