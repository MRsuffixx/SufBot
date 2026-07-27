import { z, type ZodType } from 'zod';
import { DiscordPermission, hasDiscordPermission } from '@sufbot/permissions';

const DiscordSnowflakeSchema = z.string().regex(/^\d{17,20}$/);

export const DiscordInstallationPermission = {
  Administrator: DiscordPermission.Administrator,
  ManageGuild: DiscordPermission.ManageGuild,
  ModerateMembers: DiscordPermission.ModerateMembers,
  SendMessages: DiscordPermission.SendMessages,
  ViewAuditLog: DiscordPermission.ViewAuditLog,
  ViewChannel: DiscordPermission.ViewChannel,
} as const;

export type DiscordInstallationPermissionName = keyof typeof DiscordInstallationPermission;

export type DiscordInstallationUrlOptions = {
  applicationId: string;
  permissions?: bigint;
  guildId?: string;
  disableGuildSelect?: boolean;
  redirectUri?: string;
};

export const buildDiscordInstallationUrl = (options: DiscordInstallationUrlOptions): string => {
  const applicationId = DiscordSnowflakeSchema.parse(options.applicationId);
  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('client_id', applicationId);
  url.searchParams.set(
    'permissions',
    (options.permissions ?? DiscordPermission.Administrator).toString(),
  );
  url.searchParams.set('scope', 'bot applications.commands');
  if (options.guildId !== undefined) {
    url.searchParams.set('guild_id', DiscordSnowflakeSchema.parse(options.guildId));
    url.searchParams.set('disable_guild_select', String(options.disableGuildSelect ?? true));
  }
  if (options.redirectUri !== undefined) {
    const redirectUri = new URL(options.redirectUri);
    if (!['http:', 'https:'].includes(redirectUri.protocol)) {
      throw new TypeError('Discord installation redirect URI must use HTTP or HTTPS.');
    }
    url.searchParams.set('redirect_uri', redirectUri.toString());
  }
  return url.toString();
};

export const resolveDiscordInstallationPermissions = (names: readonly string[]): bigint =>
  names.reduce((bitfield, name) => {
    const permission = DiscordInstallationPermission[name as DiscordInstallationPermissionName];
    if (permission === undefined) {
      throw new TypeError(`Unsupported Discord installation permission: ${name}.`);
    }
    return bitfield | permission;
  }, 0n);

export const CommandRegistrationStatusSchema = z.object({
  status: z.enum(['unknown', 'disabled', 'pending', 'success', 'failure']),
  mode: z.enum(['disabled', 'development-guild', 'global']),
  discoveredCount: z.number().int().nonnegative(),
  registeredCount: z.number().int().nonnegative(),
  commandNames: z.array(z.string().min(1).max(32)).max(100),
  schemaHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  updatedAt: z.iso.datetime().optional(),
  errorCode: z.string().min(1).max(64).optional(),
});

export type CommandRegistrationStatus = z.infer<typeof CommandRegistrationStatusSchema>;

export const BotGuildRuntimeStatusSchema = z.object({
  version: z.literal(1),
  guildId: DiscordSnowflakeSchema,
  botUserId: DiscordSnowflakeSchema,
  installed: z.literal(true),
  online: z.literal(true),
  administrator: z.boolean(),
  permissionBitfield: z.string().regex(/^\d+$/),
  missingPermissions: z.array(z.enum(['Administrator'])),
  highestRolePosition: z.number().int().nonnegative(),
  rolePositionWarning: z.boolean(),
  configuredChannelCount: z.number().int().nonnegative(),
  restrictedChannelCount: z.number().int().nonnegative(),
  canSendInConfiguredChannels: z.boolean().nullable(),
  canOpenDashboard: z.literal(true),
  requiresReauthorization: z.boolean(),
  commandRegistration: CommandRegistrationStatusSchema,
  guild: z.object({
    name: z.string().min(1).max(100),
    iconHash: z.string().max(128).nullable(),
    ownerDiscordId: DiscordSnowflakeSchema,
    memberCount: z.number().int().nonnegative(),
  }),
  checkedAt: z.iso.datetime(),
  lastConfigurationSyncAt: z.iso.datetime().nullable(),
});

export type BotGuildRuntimeStatus = z.infer<typeof BotGuildRuntimeStatusSchema>;

export type GuildInstallationState =
  | 'not-installed'
  | 'installed-online'
  | 'installed-offline'
  | 'missing-permissions'
  | 'configured'
  | 'status-unavailable';

export type StoredGuildInstallationState = {
  botInstalled: boolean;
  leftAt: Date | null;
  botUserId: string | null;
  botPermissionBitfield: string | null;
  botHasAdministrator: boolean | null;
  botHighestRolePosition: number | null;
  botStatusUpdatedAt: Date | null;
  botLastSeenAt: Date | null;
  commandRegistrationMode: string | null;
  commandRegistrationStatus: string | null;
  registeredCommandCount: number | null;
  commandSchemaHash: string | null;
  commandRegistrationUpdatedAt: Date | null;
};

export type ResolvedGuildInstallation = {
  state: GuildInstallationState;
  installed: boolean;
  online: boolean;
  administrator: boolean | null;
  missingPermissions: readonly string[];
  rolePositionWarning: boolean | null;
  canOpenDashboard: boolean;
  requiresReauthorization: boolean;
  commandRegistration: CommandRegistrationStatus | null;
  lastBotHeartbeat: string | null;
  lastConfigurationSyncAt: string | null;
  source: 'bot-runtime' | 'database' | 'bot-runtime-absence' | 'unavailable';
};

export const resolveGuildInstallation = (input: {
  runtime: BotGuildRuntimeStatus | null;
  stored: StoredGuildInstallationState | null;
  liveBotInstances: number;
}): ResolvedGuildInstallation => {
  if (input.runtime !== null) {
    const state: GuildInstallationState = !input.runtime.administrator
      ? 'missing-permissions'
      : input.runtime.commandRegistration.status === 'success'
        ? 'configured'
        : 'installed-online';
    return {
      state,
      installed: true,
      online: true,
      administrator: input.runtime.administrator,
      missingPermissions: input.runtime.missingPermissions,
      rolePositionWarning: input.runtime.rolePositionWarning,
      canOpenDashboard: true,
      requiresReauthorization: input.runtime.requiresReauthorization,
      commandRegistration: input.runtime.commandRegistration,
      lastBotHeartbeat: input.runtime.checkedAt,
      lastConfigurationSyncAt: input.runtime.lastConfigurationSyncAt,
      source: 'bot-runtime',
    };
  }

  if (input.liveBotInstances > 0) {
    return {
      state: 'not-installed',
      installed: false,
      online: false,
      administrator: null,
      missingPermissions: [],
      rolePositionWarning: null,
      canOpenDashboard: false,
      requiresReauthorization: false,
      commandRegistration: null,
      lastBotHeartbeat: null,
      lastConfigurationSyncAt: null,
      source: 'bot-runtime-absence',
    };
  }

  if (input.stored?.botInstalled === true && input.stored.leftAt === null) {
    return {
      state: 'installed-offline',
      installed: true,
      online: false,
      administrator: input.stored.botHasAdministrator,
      missingPermissions: input.stored.botHasAdministrator === false ? ['Administrator'] : [],
      rolePositionWarning:
        input.stored.botHighestRolePosition === null
          ? null
          : input.stored.botHighestRolePosition <= 1,
      canOpenDashboard: true,
      requiresReauthorization: input.stored.botHasAdministrator === false,
      commandRegistration: null,
      lastBotHeartbeat: input.stored.botLastSeenAt?.toISOString() ?? null,
      lastConfigurationSyncAt: null,
      source: 'database',
    };
  }

  if (input.stored?.leftAt !== null && input.stored?.leftAt !== undefined) {
    return {
      state: 'not-installed',
      installed: false,
      online: false,
      administrator: null,
      missingPermissions: [],
      rolePositionWarning: null,
      canOpenDashboard: false,
      requiresReauthorization: false,
      commandRegistration: null,
      lastBotHeartbeat: input.stored.botLastSeenAt?.toISOString() ?? null,
      lastConfigurationSyncAt: null,
      source: 'database',
    };
  }

  return {
    state: 'status-unavailable',
    installed: false,
    online: false,
    administrator: null,
    missingPermissions: [],
    rolePositionWarning: null,
    canOpenDashboard: false,
    requiresReauthorization: false,
    commandRegistration: null,
    lastBotHeartbeat: null,
    lastConfigurationSyncAt: null,
    source: 'unavailable',
  };
};

export type BotPermissionDiagnosticsInput = {
  permissionBitfield: bigint;
  highestRolePosition: number;
  configuredChannels?: readonly {
    canView: boolean;
    canSend: boolean;
  }[];
};

export const evaluateBotPermissionDiagnostics = (input: BotPermissionDiagnosticsInput) => {
  const administrator = hasDiscordPermission(
    input.permissionBitfield,
    DiscordPermission.Administrator,
  );
  const configuredChannels = input.configuredChannels ?? [];
  const restrictedChannelCount = configuredChannels.filter(
    (channel) => !channel.canView || !channel.canSend,
  ).length;
  return {
    administrator,
    missingPermissions: administrator ? [] : (['Administrator'] as const),
    rolePositionWarning: input.highestRolePosition <= 1,
    configuredChannelCount: configuredChannels.length,
    restrictedChannelCount,
    canSendInConfiguredChannels:
      configuredChannels.length === 0 ? null : restrictedChannelCount === 0,
    canOpenDashboard: true as const,
    requiresReauthorization: !administrator,
  };
};

export type CommandMetadata = {
  name: string;
  description: string;
  category: string;
  guildOnly: boolean;
  ownerOnly: boolean;
  developerOnly: boolean;
  requiredUserPermissions: readonly bigint[];
  requiredBotPermissions: readonly bigint[];
  cooldownSeconds: number;
  perGuildCooldownSeconds?: number;
  requiredModule?: string;
  premiumOnly?: boolean;
  featureFlag?: string;
};

export type DashboardSettingDefinition = {
  key: string;
  labelKey: string;
  input: 'toggle' | 'select' | 'number' | 'text';
  requiredPermission: string;
};

export type BotModuleDefinition<TConfig> = {
  metadata: {
    key: string;
    name: string;
    description: string;
    version: number;
    premium: boolean;
  };
  configSchema: ZodType<TConfig>;
  defaultConfig: TConfig;
  commands: readonly CommandMetadata[];
  eventListeners: readonly string[];
  dashboardSettings: readonly DashboardSettingDefinition[];
  permissionRequirements: readonly string[];
  cacheInvalidation: {
    segments: readonly string[];
    eventType: 'guild.config.updated';
  };
};

const command = (
  metadata: Omit<
    CommandMetadata,
    | 'guildOnly'
    | 'ownerOnly'
    | 'developerOnly'
    | 'requiredUserPermissions'
    | 'requiredBotPermissions'
    | 'cooldownSeconds'
  > &
    Partial<
      Pick<
        CommandMetadata,
        | 'guildOnly'
        | 'ownerOnly'
        | 'developerOnly'
        | 'requiredUserPermissions'
        | 'requiredBotPermissions'
        | 'cooldownSeconds'
      >
    >,
): CommandMetadata => ({
  guildOnly: false,
  ownerOnly: false,
  developerOnly: false,
  requiredUserPermissions: [],
  requiredBotPermissions: [],
  cooldownSeconds: 3,
  ...metadata,
});

export const generalModule = {
  metadata: {
    key: 'general',
    name: 'General',
    description: 'Core information, help, and configuration commands.',
    version: 1,
    premium: false,
  },
  configSchema: z.object({
    showBranding: z.boolean(),
  }),
  defaultConfig: { showBranding: true },
  commands: [
    command({
      name: 'ping',
      description: 'Check bot latency.',
      category: 'General',
      requiredModule: 'general',
    }),
    command({
      name: 'help',
      description: 'Browse available commands.',
      category: 'General',
      requiredModule: 'general',
    }),
    command({
      name: 'botinfo',
      description: 'Show bot information.',
      category: 'General',
      requiredModule: 'general',
    }),
    command({
      name: 'serverinfo',
      description: 'Show server information.',
      category: 'General',
      guildOnly: true,
      requiredModule: 'general',
    }),
    command({
      name: 'userinfo',
      description: 'Show user information.',
      category: 'General',
      requiredModule: 'general',
    }),
    command({
      name: 'settings',
      description: 'Open server settings.',
      category: 'Configuration',
      guildOnly: true,
      requiredUserPermissions: [DiscordPermission.ManageGuild],
      requiredModule: 'general',
    }),
    command({
      name: 'config',
      description: 'View or update server configuration.',
      category: 'Configuration',
      guildOnly: true,
      requiredUserPermissions: [DiscordPermission.ManageGuild],
      requiredModule: 'general',
    }),
    command({
      name: 'dashboard',
      description: 'Open this server in the SufBot dashboard.',
      category: 'Configuration',
      guildOnly: true,
      requiredUserPermissions: [DiscordPermission.ManageGuild],
      requiredModule: 'general',
    }),
    command({
      name: 'diagnostics',
      description: 'Check bot permissions and service health.',
      category: 'Administration',
      guildOnly: true,
      requiredUserPermissions: [DiscordPermission.Administrator],
      requiredModule: 'general',
      cooldownSeconds: 10,
      perGuildCooldownSeconds: 5,
    }),
    command({
      name: 'admin',
      description: 'Run platform administrative actions.',
      category: 'Administration',
      developerOnly: true,
      cooldownSeconds: 10,
    }),
  ],
  eventListeners: ['guildCreate', 'guildDelete', 'interactionCreate'],
  dashboardSettings: [
    {
      key: 'showBranding',
      labelKey: 'modules.general.showBranding',
      input: 'toggle',
      requiredPermission: 'module.general.edit',
    },
  ],
  permissionRequirements: ['module.general.view', 'module.general.edit'],
  cacheInvalidation: {
    segments: ['config', 'module:general'],
    eventType: 'guild.config.updated',
  },
} satisfies BotModuleDefinition<{ showBranding: boolean }>;

export const moderationModule = {
  metadata: {
    key: 'moderation',
    name: 'Moderation',
    description: 'Safe moderation actions with explicit permission checks and audit logs.',
    version: 1,
    premium: false,
  },
  configSchema: z.object({
    auditChannelId: z
      .string()
      .regex(/^\d{17,20}$/)
      .nullable(),
    defaultTimeoutMinutes: z.number().int().min(1).max(40_320),
  }),
  defaultConfig: { auditChannelId: null, defaultTimeoutMinutes: 10 },
  commands: [
    command({
      name: 'timeout',
      description: 'Temporarily prevent a member from interacting.',
      category: 'Moderation',
      guildOnly: true,
      requiredUserPermissions: [DiscordPermission.ModerateMembers],
      requiredBotPermissions: [DiscordPermission.ModerateMembers],
      requiredModule: 'moderation',
      cooldownSeconds: 5,
      perGuildCooldownSeconds: 2,
    }),
  ],
  eventListeners: ['guildMemberUpdate'],
  dashboardSettings: [
    {
      key: 'auditChannelId',
      labelKey: 'modules.moderation.auditChannel',
      input: 'select',
      requiredPermission: 'module.moderation.edit',
    },
    {
      key: 'defaultTimeoutMinutes',
      labelKey: 'modules.moderation.defaultTimeout',
      input: 'number',
      requiredPermission: 'module.moderation.edit',
    },
  ],
  permissionRequirements: ['module.moderation.view', 'module.moderation.edit', 'command.timeout'],
  cacheInvalidation: {
    segments: ['config', 'module:moderation'],
    eventType: 'guild.config.updated',
  },
} satisfies BotModuleDefinition<{
  auditChannelId: string | null;
  defaultTimeoutMinutes: number;
}>;

export const builtInModules = [generalModule, moderationModule] as const;

export const commandMetadata = new Map(
  builtInModules.flatMap((module) => module.commands).map((metadata) => [metadata.name, metadata]),
);

export const requireCommandMetadata = (name: string): CommandMetadata => {
  const metadata = commandMetadata.get(name);
  if (metadata === undefined) throw new TypeError(`Command metadata is missing for ${name}.`);
  return metadata;
};
