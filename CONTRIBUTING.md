# Contributing

Contributions should preserve tenant isolation, explicit authorization, strict types, and package
boundaries.

## Workflow

1. Create a focused branch from `main`.
2. Use Node.js 24 and the pinned pnpm version from `package.json`.
3. Install with `pnpm install --frozen-lockfile`.
4. Add tests before changing authorization, validation, caching, jobs, or persistence.
5. Run the full local gate:

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:validate
docker compose config --quiet
```

Use conventional, narrowly scoped commits where practical. Pull requests must explain the
security/tenant impact, verification performed, migrations, deployment order, and rollback plan.

## Engineering rules

- Do not use `any`, `@ts-ignore`, unchecked casts, or client-provided authorization facts to bypass
  the type or policy system.
- Put shared schemas and policies in their existing packages. Do not duplicate guild authorization
  in route or component code.
- Scope every tenant query by guild ID. Add a negative cross-guild test for new data access paths.
- Validate all external input at the boundary with Zod. Keep response and pagination sizes bounded.
- Write sensitive state changes and their audit events in one transaction.
- Never log message content, OAuth tokens, cookies, authorization headers, private endpoints, or
  secrets.
- Make retryable jobs idempotent and add a durable unique constraint before relying on Redis
  deduplication alone.
- Keep Discord permissions in central command/module metadata and enforce them again at execution
  time.

## Database changes

Edit `packages/database/prisma/schema.prisma`, run `pnpm db:migrate --name <name>`, review the
generated SQL, update seed/test fixtures, and document rollout and rollback. Never rewrite a
migration that may have reached a shared environment.

## Module changes

A module must define metadata, validated configuration, defaults, commands/listeners, dashboard
settings, permission requirements, and cache invalidation segments. Register it through
`packages/discord`; avoid imports from application packages.

## Security

Follow [SECURITY.md](SECURITY.md). Never include real guild data or credentials in a test, fixture,
screenshot, issue, or pull request.
