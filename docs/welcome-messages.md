# Welcome and goodbye messages

Welcome channel messages, welcome DMs, and goodbye channel messages share one strict message model:
text, embed, or text plus embed; bounded Discord fields; HTTPS image links; explicit mentions;
delay; and optional timed deletion. Unknown template variables produce warnings and remain visible
unless the configured policy removes them. No `eval` or executable template syntax exists.

Supported variables cover bounded user/member/server/date data, verification channel/role, and
best-effort invite placeholders. Mass mentions are neutralized and Discord allowed mentions are
empty except for the joining user when explicitly enabled.

Delivery jobs re-fetch the member and current configuration. A DM rejection is sanitized and does
not fail other onboarding work. Goodbye uses a bounded last-known snapshot and does not assume a
fully cached member. Test sends are Manage Server-only, rate-limited, audited, clearly marked, and
cannot target arbitrary users.

Invite tracking is intentionally not enabled in this release: Discord invite attribution is
ambiguous for vanity URLs, simultaneous joins, deleted invites, missing permissions, and cache
delay. Welcome delivery never depends on it.
