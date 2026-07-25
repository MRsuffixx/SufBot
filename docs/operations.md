# Operations

## Probes

- API `/v1/health` proves the event loop can serve a response.
- API `/v1/ready` verifies PostgreSQL and Redis; route traffic only when it is 200.
- Web `/status` is a public product status page and a container liveness target.
- Bot/worker container checks prove the process remains alive; alert from structured
  connection/error logs for dependency health.

The API Prometheus text endpoint is `/v1/internal/metrics` and requires the same
HMAC/replay protection as other internal routes. Scrape through a trusted collector
that generates fresh signed headers; do not make the endpoint public to simplify
Prometheus configuration.

## Logging

All services emit JSON in production with app/environment metadata. API logs include
request/correlation ID, route, status, and duration. Bot/worker logs include interaction
or job identifiers. Ship stdout to a restricted log platform and set retention
separately from guild audit retention.

Alert on:

- readiness failures and restart loops;
- increased 401/403/429/5xx rates;
- Discord login/reconnection failures;
- PostgreSQL pool/timeout errors;
- Redis errors and cache-load failures;
- dead-letter jobs;
- unexpected configuration reloads or session-revocation spikes.

Never enable debug logging permanently in production. Request IDs are safe correlation
handles; raw tokens, cookies, message content, and full request bodies are not.

## Routine checks

- Daily: readiness, error rate, dead letters, backup success.
- Weekly: dependency/security alerts, restore sample, stale active jobs, audit anomaly
  review.
- Per release: migrations, container vulnerability scan, smoke tests, Discord command
  registration, rollback compatibility.
- Quarterly: secret rotation rehearsal, access review, threat-model update, disaster
  recovery exercise.
