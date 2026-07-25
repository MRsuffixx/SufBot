# Permission system

`@sufbot/permissions` is a deterministic policy package. It accepts an
`AuthorizationContext` and returns an explicit allowed/denied decision with a stable
code. Delivery code converts denials to safe errors; policy code does not perform
database or network I/O.

## Command policy

Each command declares:

- guild, owner, and developer restrictions;
- required Discord user and bot permission bitfields;
- user and per-guild cooldowns;
- required module;
- premium and feature-flag gates;
- optional custom permission.

The Sapphire `Authorized` precondition evaluates this metadata for every execution.
Discord application-command defaults are usability hints only.

The General module contains information and configuration examples. The Moderation
module's `/timeout` requires the module to be enabled plus `Moderate Members` for both
the actor and bot. Discord role hierarchy is checked again through
`GuildMember.moderatable`.

## Administrator semantics

The Discord `Administrator` bit satisfies individual Discord permission checks, as it
does in Discord. Platform `ADMIN`, `DEVELOPER`, and `OWNER` satisfy `canManageGuild`
only where the policy intentionally accepts platform administration. Owner-only bot
commands require the exact `OWNER` role; developer-only commands accept `OWNER` or
`DEVELOPER`.

## Custom roles and command overrides

The schema supports:

- `GuildRolePermission` for named dashboard/module permissions;
- `GuildCommandOverride` for allow/deny sets by everyone, user, role, or channel;
- module-specific permission names;
- optional guild-scoped API keys.

The initial dashboard persists and audits role command overrides. Complete Discord
role resolution in the runtime authorization context is the next extension before
those overrides should drive every command. Deny precedence should remain explicit:
specific deny, specific allow, role deny, role allow, everyone policy, then command
defaults.

## Testing

Unit tests cover owner/administrator paths, missing Discord permissions, disabled
modules, premium/feature gates, and cross-tenant rejection. Integration tests verify a
grant for guild A cannot manage guild B. Every new policy needs at least one positive
and one negative test, including a privilege-escalation case.
