import { describe, expect, it } from 'vitest';
import {
  BotGuildRuntimeStatusSchema,
  buildDiscordInstallationUrl,
  evaluateBotPermissionDiagnostics,
  resolveDiscordInstallationPermissions,
  resolveGuildInstallation,
} from '@sufbot/discord';
import { DiscordPermission } from '@sufbot/permissions';

const applicationId = '1510254282958573700';
const guildId = '1129729404831006760';

const runtimeStatus = BotGuildRuntimeStatusSchema.parse({
  version: 1,
  guildId,
  botUserId: applicationId,
  installed: true,
  online: true,
  administrator: true,
  permissionBitfield: '8',
  missingPermissions: [],
  highestRolePosition: 10,
  rolePositionWarning: false,
  configuredChannelCount: 0,
  restrictedChannelCount: 0,
  canSendInConfiguredChannels: null,
  canOpenDashboard: true,
  requiresReauthorization: false,
  commandRegistration: {
    status: 'success',
    mode: 'development-guild',
    discoveredCount: 10,
    registeredCount: 10,
    commandNames: ['ping'],
    schemaHash: 'a'.repeat(64),
    updatedAt: new Date().toISOString(),
  },
  guild: {
    name: 'Test guild',
    iconHash: null,
    ownerDiscordId: '111111111111111111',
    memberCount: 10,
  },
  checkedAt: new Date().toISOString(),
  lastConfigurationSyncAt: null,
});

describe('Discord installation URL', () => {
  it('requests Administrator and both required installation scopes', () => {
    const result = new URL(
      buildDiscordInstallationUrl({
        applicationId,
        permissions: resolveDiscordInstallationPermissions(['Administrator']),
      }),
    );
    expect(result.origin + result.pathname).toBe('https://discord.com/oauth2/authorize');
    expect(result.searchParams.get('client_id')).toBe(applicationId);
    expect(result.searchParams.get('permissions')).toBe('8');
    expect(result.searchParams.get('scope')?.split(' ').sort()).toEqual([
      'applications.commands',
      'bot',
    ]);
    expect(result.toString()).not.toMatch(/token|secret/i);
  });

  it('safely encodes guild preselection and redirect URI', () => {
    const result = new URL(
      buildDiscordInstallationUrl({
        applicationId,
        guildId,
        disableGuildSelect: true,
        redirectUri: 'https://sufbot.tr/dashboard?source=discord install',
      }),
    );
    expect(result.searchParams.get('guild_id')).toBe(guildId);
    expect(result.searchParams.get('disable_guild_select')).toBe('true');
    expect(result.searchParams.get('redirect_uri')).toBe(
      'https://sufbot.tr/dashboard?source=discord%20install',
    );
  });

  it('rejects unsupported permission names', () => {
    expect(() => resolveDiscordInstallationPermissions(['MadeUpPermission'])).toThrow(
      /Unsupported Discord installation permission/,
    );
  });
});

describe('bot permission diagnostics', () => {
  it('uses bigint permission checks and reports channel restrictions', () => {
    expect(
      evaluateBotPermissionDiagnostics({
        permissionBitfield: DiscordPermission.SendMessages,
        highestRolePosition: 1,
        configuredChannels: [{ canView: true, canSend: false }],
      }),
    ).toMatchObject({
      administrator: false,
      missingPermissions: ['Administrator'],
      rolePositionWarning: true,
      restrictedChannelCount: 1,
      requiresReauthorization: true,
    });
  });

  it('recognizes Administrator without Number conversion', () => {
    expect(
      evaluateBotPermissionDiagnostics({
        permissionBitfield: BigInt('9007199254740993') | DiscordPermission.Administrator,
        highestRolePosition: 5,
      }),
    ).toMatchObject({
      administrator: true,
      missingPermissions: [],
      requiresReauthorization: false,
    });
  });
});

describe('guild installation source hierarchy', () => {
  it('prefers fresh bot runtime state over stale database state', () => {
    expect(
      resolveGuildInstallation({
        runtime: runtimeStatus,
        stored: {
          botInstalled: false,
          leftAt: null,
          botUserId: null,
          botPermissionBitfield: null,
          botHasAdministrator: null,
          botHighestRolePosition: null,
          botStatusUpdatedAt: null,
          botLastSeenAt: null,
          commandRegistrationMode: null,
          commandRegistrationStatus: null,
          registeredCommandCount: null,
          commandSchemaHash: null,
          commandRegistrationUpdatedAt: null,
        },
        liveBotInstances: 1,
      }),
    ).toMatchObject({
      state: 'configured',
      installed: true,
      online: true,
      source: 'bot-runtime',
    });
  });

  it('treats absence from a live reconciled bot as not installed', () => {
    expect(
      resolveGuildInstallation({
        runtime: null,
        stored: null,
        liveBotInstances: 1,
      }),
    ).toMatchObject({
      state: 'not-installed',
      installed: false,
      source: 'bot-runtime-absence',
    });
  });
});
