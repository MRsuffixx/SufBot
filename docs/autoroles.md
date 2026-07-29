# Automatic roles

Role groups are humans on join, bots on join, roles after the configured verification condition, and
Membership Screening-complete roles. Duplicate IDs are removed. The plan limit counts unique
configured automatic roles across all groups.

Every execution re-fetches the member and role and rejects `@everyone`, another guild's role,
managed/integration roles, deleted roles, and roles at or above the bot. Manage Roles is checked
again. Existing roles are success/idempotent skips. Partial outcomes name only role IDs and
sanitized codes; transient Discord errors follow bounded queue retry rules.

Membership Screening is accepted only on `pending: true -> false`. The central evaluator combines
that flag with `captchaVerified` for CAPTCHA_ONLY, SCREENING_ONLY, EITHER, or BOTH. Role assignment,
unverified-role removal, durable flags, audit, and delayed welcome scheduling are kept in one
workflow.
