# Verification setup and lifecycle

The guided setup supports an existing or newly created text channel, verified role, optional
unverified role, category, role appearance, restricted channels, verification panel content, captcha
mode, timeouts, attempts, and an explicitly selected existing-member migration.

Before mutation, the dashboard/API verifies a fresh bot resource snapshot. The bot then rechecks the
initiating administrator, Manage Channels/Manage Roles, selected guild ownership, channel
manageability, managed-role status, `@everyone`, and bot role hierarchy. Non-dry-run setup uses a
two-phase `PENDING` database state so concurrent edits cannot interleave. Created Discord IDs,
previous permission overwrite bits, and a hash of the random panel nonce are persisted.

## Permission modes

- `EVERYONE_VISIBLE`: `@everyone` may view/history/use commands in the verification channel but may
  not send, react, or create/use threads. The verified role is denied view. The bot is explicitly
  allowed the configured delivery permissions.
- `DEDICATED_UNVERIFIED_ROLE`: the optional unverified role can view the panel, the verified role
  cannot, and new members receive the unverified role until the condition succeeds.

Only explicitly selected restricted channels are changed. Setup never deletes an existing channel or
role. A deleted panel/channel/role marks health `BROKEN`; repair uses stored IDs and snapshots.

Existing-member migration modes are none, deterministic first members, explicit member IDs, or all
eligible humans with a configured maximum. Bots, existing holders, unreachable members, and members
above the bot are skipped. Each assignment is retry-safe and audited.

`/verify` points members to the immutable panel. `/onboarding verify-user` and `unverify-user` are
Manage Server-gated, hierarchy-checked, and audited; they never mark a payment or billing state.
