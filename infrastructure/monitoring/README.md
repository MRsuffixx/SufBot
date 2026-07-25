# Monitoring integration

SufBot emits structured logs and a Prometheus text payload from `/v1/internal/metrics`. The metrics
route is intentionally signed and replay-protected. Place a small trusted collector/signing proxy on
the private application network and give only that component `INTERNAL_API_SECRET`; do not expose
metrics publicly.

Initial metrics include HTTP request counters and local/Redis cache hit/miss gauges. Queue, Discord
shard, Node.js runtime, and database-pool exporters should be added with cardinality limits before
large-scale operation. Never use guild IDs or user IDs as metric labels.
