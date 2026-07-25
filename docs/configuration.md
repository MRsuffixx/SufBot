# Configuration

SufBot separates private runtime material from editable product behavior.

## `.env`

`.env` is ignored by Git. Production values belong in the deployment platform's encrypted secret
store.

| Variable                     | Consumers     | Requirement                                        |
| ---------------------------- | ------------- | -------------------------------------------------- |
| `NODE_ENV`                   | all           | `development`, `test`, or `production`             |
| `DATABASE_URL`               | all           | PostgreSQL application connection URL              |
| `DIRECT_DATABASE_URL`        | migration CLI | direct PostgreSQL migration URL                    |
| `REDIS_URL`                  | all           | `redis://` or `rediss://`, including credentials   |
| `DISCORD_BOT_TOKEN`          | bot           | bot token, at least 32 characters                  |
| `DISCORD_CLIENT_ID`          | bot/web       | 17–20 digit application snowflake                  |
| `DISCORD_CLIENT_SECRET`      | web           | OAuth client secret                                |
| `AUTH_SECRET`                | web           | independent random value, at least 32 characters   |
| `AUTH_TRUST_HOST`            | web           | explicit boolean for trusted proxy host handling   |
| `INTERNAL_API_SECRET`        | api/web       | shared service-signing secret                      |
| `WEBHOOK_SIGNING_SECRET`     | api           | signing/audit salt reserved for webhook boundaries |
| `ENCRYPTION_KEY`             | web           | base64-encoded 32-byte OAuth storage key           |
| `SESSION_ENCRYPTION_KEY`     | web           | separate base64-encoded 32-byte future session key |
| `BOT_OWNER_DISCORD_IDS`      | bot/web       | comma-separated immutable Discord user IDs         |
| `BOT_DEVELOPER_DISCORD_IDS`  | bot/web       | comma-separated immutable Discord user IDs         |
| `PLATFORM_ADMIN_DISCORD_IDS` | bot/web       | comma-separated immutable Discord user IDs         |
| `SENTRY_DSN`                 | all           | optional private error-reporting endpoint          |

An empty allowlist is valid. Required service values are validated independently, so a worker does
not need Discord secrets and a bot does not need OAuth client credentials. Validation failures stop
startup and list field names without echoing values.

## `config.json`

`config.json` is committed, contains no secrets, and is strictly validated. Unknown keys are
rejected.

- `application`: branding, canonical domains, owner display metadata, locales.
- `discord`: command modes, guild registration targets, permissions, intents, partials, and sharding
  strategy.
- `dashboard`: theme, accepted management policies, page sizes.
- `server`: listen ports/host, CORS origins, body/time limits, OpenAPI switch.
- `security`: rate limits, session/grant lifetime, audit retention, signed-request age, and maximum
  pagination.
- `cache`: namespace, local/Redis TTL, Pub/Sub channel.
- `queue`: namespace, attempts, exponential backoff, retention.
- `features`: platform-level extension switches.
- `logging`: Pino level and local pretty-print behavior.

## Overrides

Create an optional `config.development.json`, `config.test.json`, or `config.production.json` at the
repository root. Objects are recursively merged; arrays and scalar values replace the base value.

Example local override:

```json
{
  "discord": {
    "developmentGuildIds": ["123456789012345678"]
  },
  "logging": {
    "level": "debug"
  }
}
```

Do not place tokens, passwords, private hosts, or encryption keys in overrides. After editing
configuration, run `pnpm typecheck` and start the relevant service. The owner command
`/admin reload-config` reloads and validates process-local non-secret config; it is audited, but
does not mutate environment variables.

## Operational changes

Changes to auth origins, CORS, cookies, invite permissions, intents, timeouts, pool capacity,
retention, or sharding require a deployment review. Roll out command registration changes first to a
development guild; Discord global propagation can take time.
