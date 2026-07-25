# Database

PostgreSQL is the authoritative store. Prisma's PostgreSQL adapter uses a bounded pool,
and the database package reuses one client across Next.js development reloads to avoid
connection amplification.

## Model groups

| Concern | Models |
| --- | --- |
| Identity | `User`, `OAuthCredential`, `AuthSession` |
| Tenant configuration | `Guild`, `GuildSettings`, `GuildModule` |
| Authorization | `GuildAccessGrant`, `GuildRolePermission`, `GuildCommandOverride` |
| Accountability | `GuildAuditLog`, `DashboardAccessLog`, `CommandUsage` |
| Platform extension | `ApiKey`, `Subscription`, `FeatureFlag`, `BackgroundJobRecord` |

Discord snowflakes are `VARCHAR` strings, never JavaScript numbers. UUIDs identify
internal entities. Composite uniqueness constrains per-guild modules, grants, role
permissions, overrides, and idempotent jobs.

## Tenant boundary

Every tenant-owned model includes `guildId` and an index or composite constraint using
it. Callers must validate current access before the query and include the same guild ID
in the database predicate. Repository methods do not accept an unscoped record ID for
guild configuration changes.

`GuildAuditLog.guildId` is nullable only so a deleted guild can release its foreign key
without deleting accountability records. `Subscription` uses `RESTRICT` to prevent
deleting a guild that still has commercial history. User soft deletion is limited to
identity lifecycle; ordinary configuration uses hard relational integrity.

## Consistency

Settings and module writes use interactive transactions:

1. verify the guild exists;
2. read/create current state;
3. compare the submitted version;
4. update and increment the version;
5. append the sanitized audit event;
6. commit both together.

Redis invalidation occurs only after commit. A failed invalidation leaves the database
correct and TTL eventually expires stale cache state. The UI reports failure so an
operator can retry publication.

## JSON policy

Relational columns hold identity, access, status, versions, and searchable fields.
JSON is limited to module-specific validated configuration, feature metadata, job
payload context, and sanitized before/after audit values. Application schemas must
validate module JSON before use.

## Migrations

The initial SQL is checked in under `packages/database/prisma/migrations`. Use:

```bash
pnpm db:migrate --name descriptive_change
pnpm db:validate
pnpm db:deploy
```

`db:migrate` is for local development and requires a development database.
`db:deploy` is non-interactive and is the only migration command for CI/production.
Review generated SQL for locks, table rewrites, indexes, data loss, and rollback impact.
Never edit a migration already applied to a shared environment.

For large tables, use expand/migrate/contract:

1. add nullable/backward-compatible structures;
2. deploy dual-compatible code;
3. backfill in bounded background batches;
4. add constraints/indexes safely;
5. remove obsolete structures in a later release.

## Seed and test database

`pnpm db:seed` idempotently enables the built-in General and Moderation platform
feature flags. It does not create users, credentials, guilds, or API keys.

Set `TEST_DATABASE_URL` and apply migrations before `pnpm test` to run database-backed
isolation and transactional-audit tests. Test credentials must never target a shared or
production database.

## Backup and restore

Use encrypted automated PostgreSQL backups with point-in-time recovery appropriate to
the provider. Regularly restore into an isolated environment, run `pnpm db:validate`,
compare migration state, and execute tenant/audit smoke tests. A backup that has not
been restored is not a verified backup.
