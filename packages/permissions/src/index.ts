import { AuthorizationError } from '@sufbot/shared';

export const DiscordPermission = {
  Administrator: 1n << 3n,
  ManageChannels: 1n << 4n,
  ManageGuild: 1n << 5n,
  AddReactions: 1n << 6n,
  ViewAuditLog: 1n << 7n,
  ViewChannel: 1n << 10n,
  SendMessages: 1n << 11n,
  ManageMessages: 1n << 13n,
  EmbedLinks: 1n << 14n,
  AttachFiles: 1n << 15n,
  ReadMessageHistory: 1n << 16n,
  ManageRoles: 1n << 28n,
  UseApplicationCommands: 1n << 31n,
  CreatePublicThreads: 1n << 35n,
  CreatePrivateThreads: 1n << 36n,
  SendMessagesInThreads: 1n << 38n,
  ModerateMembers: 1n << 40n,
} as const;

export const hasDiscordPermission = (bitfield: bigint, permission: bigint): boolean =>
  (bitfield & DiscordPermission.Administrator) === DiscordPermission.Administrator ||
  (bitfield & permission) === permission;

export type PlatformRole = 'USER' | 'ADMIN' | 'DEVELOPER' | 'OWNER';

export type AuthorizationContext = {
  userId: string;
  discordUserId: string;
  platformRole: PlatformRole;
  guildId?: string;
  guildOwnerDiscordId?: string;
  userPermissions: bigint;
  botPermissions: bigint;
  customPermissions: ReadonlySet<string>;
  enabledModules: ReadonlySet<string>;
  entitlements: ReadonlySet<string>;
  featureFlags: ReadonlySet<string>;
};

export type CommandPolicy = {
  guildOnly: boolean;
  ownerOnly: boolean;
  developerOnly: boolean;
  requiredUserPermissions: readonly bigint[];
  requiredBotPermissions: readonly bigint[];
  requiredModule?: string;
  premium?: {
    required: true;
    entitlement: string;
  };
  featureFlag?: string;
  customPermission?: string;
};

export type PolicyDecision =
  | { allowed: true }
  | {
      allowed: false;
      code:
        | 'GUILD_ONLY'
        | 'OWNER_ONLY'
        | 'DEVELOPER_ONLY'
        | 'USER_PERMISSION_MISSING'
        | 'BOT_PERMISSION_MISSING'
        | 'MODULE_DISABLED'
        | 'PREMIUM_REQUIRED'
        | 'FEATURE_DISABLED'
        | 'CUSTOM_PERMISSION_MISSING'
        | 'GUILD_ACCESS_DENIED';
      reason: string;
    };

export const isPlatformDeveloper = (role: PlatformRole): boolean =>
  role === 'OWNER' || role === 'DEVELOPER';

export const isPlatformAdministrator = (role: PlatformRole): boolean =>
  role === 'OWNER' || role === 'DEVELOPER' || role === 'ADMIN';

export const canManageGuild = (context: AuthorizationContext): PolicyDecision => {
  if (isPlatformAdministrator(context.platformRole)) return { allowed: true };
  if (context.guildId === undefined || context.guildOwnerDiscordId === undefined) {
    return {
      allowed: false,
      code: 'GUILD_ACCESS_DENIED',
      reason: 'Guild context is incomplete.',
    };
  }
  if (context.discordUserId === context.guildOwnerDiscordId) return { allowed: true };
  if (hasDiscordPermission(context.userPermissions, DiscordPermission.ManageGuild)) {
    return { allowed: true };
  }
  if (context.customPermissions.has('guild.manage')) return { allowed: true };
  return {
    allowed: false,
    code: 'GUILD_ACCESS_DENIED',
    reason: 'The actor is neither the guild owner nor an authorized guild administrator.',
  };
};

export const canExecuteCommand = (
  context: AuthorizationContext,
  policy: CommandPolicy,
): PolicyDecision => {
  if (policy.guildOnly && context.guildId === undefined) {
    return { allowed: false, code: 'GUILD_ONLY', reason: 'The command requires a guild.' };
  }
  if (policy.ownerOnly && context.platformRole !== 'OWNER') {
    return { allowed: false, code: 'OWNER_ONLY', reason: 'The command requires bot owner access.' };
  }
  if (policy.developerOnly && !isPlatformDeveloper(context.platformRole)) {
    return {
      allowed: false,
      code: 'DEVELOPER_ONLY',
      reason: 'The command requires bot developer access.',
    };
  }
  if (
    policy.requiredUserPermissions.some(
      (permission) => !hasDiscordPermission(context.userPermissions, permission),
    )
  ) {
    return {
      allowed: false,
      code: 'USER_PERMISSION_MISSING',
      reason: 'One or more Discord user permissions are missing.',
    };
  }
  if (
    policy.requiredBotPermissions.some(
      (permission) => !hasDiscordPermission(context.botPermissions, permission),
    )
  ) {
    return {
      allowed: false,
      code: 'BOT_PERMISSION_MISSING',
      reason: 'One or more Discord bot permissions are missing.',
    };
  }
  if (policy.requiredModule !== undefined && !context.enabledModules.has(policy.requiredModule)) {
    return {
      allowed: false,
      code: 'MODULE_DISABLED',
      reason: `The ${policy.requiredModule} module is disabled.`,
    };
  }
  if (policy.premium?.required === true && !context.entitlements.has(policy.premium.entitlement)) {
    return {
      allowed: false,
      code: 'PREMIUM_REQUIRED',
      reason: `The ${policy.premium.entitlement} Premium entitlement is required.`,
    };
  }
  if (policy.featureFlag !== undefined && !context.featureFlags.has(policy.featureFlag)) {
    return { allowed: false, code: 'FEATURE_DISABLED', reason: 'The feature is disabled.' };
  }
  if (
    policy.customPermission !== undefined &&
    !context.customPermissions.has(policy.customPermission)
  ) {
    return {
      allowed: false,
      code: 'CUSTOM_PERMISSION_MISSING',
      reason: `The ${policy.customPermission} permission is required.`,
    };
  }
  return { allowed: true };
};

export const requirePolicy = (decision: PolicyDecision): void => {
  if (!decision.allowed) {
    throw new AuthorizationError(decision.reason, decision.code);
  }
};

export const assertTenantScope = (authorizedGuildId: string, requestedGuildId: string): void => {
  if (authorizedGuildId !== requestedGuildId) {
    throw new AuthorizationError('Cross-guild access was rejected.', 'CROSS_GUILD_ACCESS_DENIED');
  }
};

export const canEditGuildModule = (
  context: AuthorizationContext,
  moduleName: string,
): PolicyDecision => {
  const manage = canManageGuild(context);
  if (!manage.allowed) return manage;
  if (
    !context.featureFlags.has(`module:${moduleName}`) &&
    !context.enabledModules.has(moduleName)
  ) {
    return {
      allowed: false,
      code: 'FEATURE_DISABLED',
      reason: `The ${moduleName} module is not available to this guild.`,
    };
  }
  return { allowed: true };
};

export const canViewAuditLogs = (context: AuthorizationContext): PolicyDecision => {
  const manage = canManageGuild(context);
  if (manage.allowed) return manage;
  if (hasDiscordPermission(context.userPermissions, DiscordPermission.ViewAuditLog)) {
    return { allowed: true };
  }
  return manage;
};
