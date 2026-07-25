// src/index.ts
import { AuthorizationError } from "@sufbot/shared";
var DiscordPermission = {
  Administrator: 1n << 3n,
  ManageGuild: 1n << 5n,
  ViewAuditLog: 1n << 7n,
  ModerateMembers: 1n << 40n
};
var hasPermission = (bitfield, permission) => (bitfield & DiscordPermission.Administrator) === DiscordPermission.Administrator || (bitfield & permission) === permission;
var isPlatformDeveloper = (role) => role === "OWNER" || role === "DEVELOPER";
var isPlatformAdministrator = (role) => role === "OWNER" || role === "DEVELOPER" || role === "ADMIN";
var canManageGuild = (context) => {
  if (isPlatformAdministrator(context.platformRole)) return { allowed: true };
  if (context.guildId === void 0 || context.guildOwnerDiscordId === void 0) {
    return {
      allowed: false,
      code: "GUILD_ACCESS_DENIED",
      reason: "Guild context is incomplete."
    };
  }
  if (context.discordUserId === context.guildOwnerDiscordId) return { allowed: true };
  if (hasPermission(context.userPermissions, DiscordPermission.ManageGuild)) {
    return { allowed: true };
  }
  if (context.customPermissions.has("guild.manage")) return { allowed: true };
  return {
    allowed: false,
    code: "GUILD_ACCESS_DENIED",
    reason: "The actor is neither the guild owner nor an authorized guild administrator."
  };
};
var canExecuteCommand = (context, policy) => {
  if (policy.guildOnly && context.guildId === void 0) {
    return { allowed: false, code: "GUILD_ONLY", reason: "The command requires a guild." };
  }
  if (policy.ownerOnly && context.platformRole !== "OWNER") {
    return { allowed: false, code: "OWNER_ONLY", reason: "The command requires bot owner access." };
  }
  if (policy.developerOnly && !isPlatformDeveloper(context.platformRole)) {
    return {
      allowed: false,
      code: "DEVELOPER_ONLY",
      reason: "The command requires bot developer access."
    };
  }
  if (policy.requiredUserPermissions.some((permission) => !hasPermission(context.userPermissions, permission))) {
    return {
      allowed: false,
      code: "USER_PERMISSION_MISSING",
      reason: "One or more Discord user permissions are missing."
    };
  }
  if (policy.requiredBotPermissions.some((permission) => !hasPermission(context.botPermissions, permission))) {
    return {
      allowed: false,
      code: "BOT_PERMISSION_MISSING",
      reason: "One or more Discord bot permissions are missing."
    };
  }
  if (policy.requiredModule !== void 0 && !context.enabledModules.has(policy.requiredModule)) {
    return {
      allowed: false,
      code: "MODULE_DISABLED",
      reason: `The ${policy.requiredModule} module is disabled.`
    };
  }
  if (policy.premiumOnly === true && !context.premium) {
    return { allowed: false, code: "PREMIUM_REQUIRED", reason: "A premium plan is required." };
  }
  if (policy.featureFlag !== void 0 && !context.featureFlags.has(policy.featureFlag)) {
    return { allowed: false, code: "FEATURE_DISABLED", reason: "The feature is disabled." };
  }
  if (policy.customPermission !== void 0 && !context.customPermissions.has(policy.customPermission)) {
    return {
      allowed: false,
      code: "CUSTOM_PERMISSION_MISSING",
      reason: `The ${policy.customPermission} permission is required.`
    };
  }
  return { allowed: true };
};
var requirePolicy = (decision) => {
  if (!decision.allowed) {
    throw new AuthorizationError(decision.reason, decision.code);
  }
};
var assertTenantScope = (authorizedGuildId, requestedGuildId) => {
  if (authorizedGuildId !== requestedGuildId) {
    throw new AuthorizationError(
      "Cross-guild access was rejected.",
      "CROSS_GUILD_ACCESS_DENIED"
    );
  }
};
var canEditGuildModule = (context, moduleName) => {
  const manage = canManageGuild(context);
  if (!manage.allowed) return manage;
  if (!context.featureFlags.has(`module:${moduleName}`) && !context.enabledModules.has(moduleName)) {
    return {
      allowed: false,
      code: "FEATURE_DISABLED",
      reason: `The ${moduleName} module is not available to this guild.`
    };
  }
  return { allowed: true };
};
var canViewAuditLogs = (context) => {
  const manage = canManageGuild(context);
  if (manage.allowed) return manage;
  if (hasPermission(context.userPermissions, DiscordPermission.ViewAuditLog)) {
    return { allowed: true };
  }
  return manage;
};
export {
  DiscordPermission,
  assertTenantScope,
  canEditGuildModule,
  canExecuteCommand,
  canManageGuild,
  canViewAuditLogs,
  isPlatformAdministrator,
  isPlatformDeveloper,
  requirePolicy
};
//# sourceMappingURL=index.js.map