declare const DiscordPermission: {
    readonly Administrator: bigint;
    readonly ManageGuild: bigint;
    readonly ViewAuditLog: bigint;
    readonly ModerateMembers: bigint;
};
type PlatformRole = 'USER' | 'ADMIN' | 'DEVELOPER' | 'OWNER';
type AuthorizationContext = {
    userId: string;
    discordUserId: string;
    platformRole: PlatformRole;
    guildId?: string;
    guildOwnerDiscordId?: string;
    userPermissions: bigint;
    botPermissions: bigint;
    customPermissions: ReadonlySet<string>;
    enabledModules: ReadonlySet<string>;
    premium: boolean;
    featureFlags: ReadonlySet<string>;
};
type CommandPolicy = {
    guildOnly: boolean;
    ownerOnly: boolean;
    developerOnly: boolean;
    requiredUserPermissions: readonly bigint[];
    requiredBotPermissions: readonly bigint[];
    requiredModule?: string;
    premiumOnly?: boolean;
    featureFlag?: string;
    customPermission?: string;
};
type PolicyDecision = {
    allowed: true;
} | {
    allowed: false;
    code: 'GUILD_ONLY' | 'OWNER_ONLY' | 'DEVELOPER_ONLY' | 'USER_PERMISSION_MISSING' | 'BOT_PERMISSION_MISSING' | 'MODULE_DISABLED' | 'PREMIUM_REQUIRED' | 'FEATURE_DISABLED' | 'CUSTOM_PERMISSION_MISSING' | 'GUILD_ACCESS_DENIED';
    reason: string;
};
declare const isPlatformDeveloper: (role: PlatformRole) => boolean;
declare const isPlatformAdministrator: (role: PlatformRole) => boolean;
declare const canManageGuild: (context: AuthorizationContext) => PolicyDecision;
declare const canExecuteCommand: (context: AuthorizationContext, policy: CommandPolicy) => PolicyDecision;
declare const requirePolicy: (decision: PolicyDecision) => void;
declare const assertTenantScope: (authorizedGuildId: string, requestedGuildId: string) => void;
declare const canEditGuildModule: (context: AuthorizationContext, moduleName: string) => PolicyDecision;
declare const canViewAuditLogs: (context: AuthorizationContext) => PolicyDecision;

export { type AuthorizationContext, type CommandPolicy, DiscordPermission, type PlatformRole, type PolicyDecision, assertTenantScope, canEditGuildModule, canExecuteCommand, canManageGuild, canViewAuditLogs, isPlatformAdministrator, isPlatformDeveloper, requirePolicy };
