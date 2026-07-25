import { describe, expect, it } from 'vitest';
import {
  DiscordPermission,
  assertTenantScope,
  canExecuteCommand,
  canManageGuild,
  type AuthorizationContext,
  type CommandPolicy,
} from '@sufbot/permissions';

const context = (
  overrides: Partial<AuthorizationContext> = {},
): AuthorizationContext => ({
  userId: 'user-1',
  discordUserId: '111111111111111111',
  platformRole: 'USER',
  guildId: '222222222222222222',
  guildOwnerDiscordId: '333333333333333333',
  userPermissions: 0n,
  botPermissions: DiscordPermission.Administrator,
  customPermissions: new Set(),
  enabledModules: new Set(['general']),
  premium: false,
  featureFlags: new Set(),
  ...overrides,
});

const policy = (overrides: Partial<CommandPolicy> = {}): CommandPolicy => ({
  guildOnly: true,
  ownerOnly: false,
  developerOnly: false,
  requiredUserPermissions: [],
  requiredBotPermissions: [],
  ...overrides,
});

describe('permission policies', () => {
  it('allows guild owners, Manage Guild holders, and platform administrators', () => {
    expect(
      canManageGuild(
        context({ discordUserId: '333333333333333333' }),
      ).allowed,
    ).toBe(true);
    expect(
      canManageGuild(
        context({ userPermissions: DiscordPermission.ManageGuild }),
      ).allowed,
    ).toBe(true);
    expect(canManageGuild(context({ platformRole: 'ADMIN' })).allowed).toBe(true);
  });

  it('denies a user without a valid management authority', () => {
    expect(canManageGuild(context())).toMatchObject({
      allowed: false,
      code: 'GUILD_ACCESS_DENIED',
    });
  });

  it('fails closed for command module, premium, feature, and permission requirements', () => {
    expect(
      canExecuteCommand(context(), policy({ requiredModule: 'moderation' })),
    ).toMatchObject({ allowed: false, code: 'MODULE_DISABLED' });
    expect(
      canExecuteCommand(context(), policy({ premiumOnly: true })),
    ).toMatchObject({ allowed: false, code: 'PREMIUM_REQUIRED' });
    expect(
      canExecuteCommand(context(), policy({ featureFlag: 'beta-command' })),
    ).toMatchObject({ allowed: false, code: 'FEATURE_DISABLED' });
    expect(
      canExecuteCommand(
        context(),
        policy({ requiredUserPermissions: [DiscordPermission.ModerateMembers] }),
      ),
    ).toMatchObject({ allowed: false, code: 'USER_PERMISSION_MISSING' });
  });

  it('keeps owner-only and developer-only policies distinct', () => {
    expect(
      canExecuteCommand(context({ platformRole: 'DEVELOPER' }), policy({ ownerOnly: true })),
    ).toMatchObject({ allowed: false, code: 'OWNER_ONLY' });
    expect(
      canExecuteCommand(context({ platformRole: 'OWNER' }), policy({ ownerOnly: true })),
    ).toEqual({ allowed: true });
    expect(
      canExecuteCommand(context({ platformRole: 'USER' }), policy({ developerOnly: true })),
    ).toMatchObject({ allowed: false, code: 'DEVELOPER_ONLY' });
    expect(
      canExecuteCommand(
        context({ platformRole: 'DEVELOPER' }),
        policy({ developerOnly: true }),
      ),
    ).toEqual({ allowed: true });
  });

  it('rejects cross-tenant access', () => {
    expect(() =>
      assertTenantScope('111111111111111111', '222222222222222222'),
    ).toThrowError(/Cross-guild access/);
  });
});
