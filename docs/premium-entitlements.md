# Premium entitlements

`EntitlementService` is the only product-facing authority:

- `hasGuildEntitlement(guildId, key)`
- `requireGuildEntitlement(guildId, key)`
- `getGuildPlan(guildId)`
- `getGuildPremiumStatus(guildId)`
- `listGuildEntitlements(guildId)`

PostgreSQL is durable authority. Redis keys are environment-scoped, schema-validated, versioned, and
bounded by TTL. Cache failures fall back to PostgreSQL and never grant access. Reconciliation
publishes `guild.entitlements.updated` after commit; bot processes invalidate their local view.

Feature set version 1 includes base `premium`, advanced AutoMod, extended moderation history and
logging, ticket transcript/panel capacity, advanced welcome/reaction roles, scheduled messages,
analytics, branding, custom-command/temporary-voice limits, and the support badge.

Limits come from validated config:

| Limit                   | Free | Premium |
| ----------------------- | ---: | ------: |
| AutoMod rules           |    3 |     100 |
| Ticket panels           |    1 |      25 |
| Custom commands         |    5 |     100 |
| Moderation history days |    7 |     365 |

Bot command metadata declares the required entitlement and centralized authorization evaluates it.
The API exposes a reusable guild entitlement guard. Dashboard controls show their lock and required
plan, but server enforcement remains mandatory. Essential moderation safety and role hierarchy
validation remain free.
