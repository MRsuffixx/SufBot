// src/index.ts
import { z } from "zod";
import { DiscordPermission } from "@sufbot/permissions";
var command = (metadata) => ({
  guildOnly: false,
  ownerOnly: false,
  developerOnly: false,
  requiredUserPermissions: [],
  requiredBotPermissions: [],
  cooldownSeconds: 3,
  ...metadata
});
var generalModule = {
  metadata: {
    key: "general",
    name: "General",
    description: "Core information, help, and configuration commands.",
    version: 1,
    premium: false
  },
  configSchema: z.object({
    showBranding: z.boolean()
  }),
  defaultConfig: { showBranding: true },
  commands: [
    command({ name: "ping", description: "Check bot latency.", category: "General", requiredModule: "general" }),
    command({ name: "help", description: "Browse available commands.", category: "General", requiredModule: "general" }),
    command({ name: "botinfo", description: "Show bot information.", category: "General", requiredModule: "general" }),
    command({
      name: "serverinfo",
      description: "Show server information.",
      category: "General",
      guildOnly: true,
      requiredModule: "general"
    }),
    command({ name: "userinfo", description: "Show user information.", category: "General", requiredModule: "general" }),
    command({
      name: "settings",
      description: "Open server settings.",
      category: "Configuration",
      guildOnly: true,
      requiredUserPermissions: [DiscordPermission.ManageGuild],
      requiredModule: "general"
    }),
    command({
      name: "config",
      description: "View or update server configuration.",
      category: "Configuration",
      guildOnly: true,
      requiredUserPermissions: [DiscordPermission.ManageGuild],
      requiredModule: "general"
    }),
    command({
      name: "admin",
      description: "Run platform administrative actions.",
      category: "Administration",
      developerOnly: true,
      cooldownSeconds: 10
    })
  ],
  eventListeners: ["guildCreate", "guildDelete", "interactionCreate"],
  dashboardSettings: [
    {
      key: "showBranding",
      labelKey: "modules.general.showBranding",
      input: "toggle",
      requiredPermission: "module.general.edit"
    }
  ],
  permissionRequirements: ["module.general.view", "module.general.edit"],
  cacheInvalidation: {
    segments: ["config", "module:general"],
    eventType: "guild.config.updated"
  }
};
var moderationModule = {
  metadata: {
    key: "moderation",
    name: "Moderation",
    description: "Safe moderation actions with explicit permission checks and audit logs.",
    version: 1,
    premium: false
  },
  configSchema: z.object({
    auditChannelId: z.string().regex(/^\d{17,20}$/).nullable(),
    defaultTimeoutMinutes: z.number().int().min(1).max(40320)
  }),
  defaultConfig: { auditChannelId: null, defaultTimeoutMinutes: 10 },
  commands: [
    command({
      name: "timeout",
      description: "Temporarily prevent a member from interacting.",
      category: "Moderation",
      guildOnly: true,
      requiredUserPermissions: [DiscordPermission.ModerateMembers],
      requiredBotPermissions: [DiscordPermission.ModerateMembers],
      requiredModule: "moderation",
      cooldownSeconds: 5,
      perGuildCooldownSeconds: 2
    })
  ],
  eventListeners: ["guildMemberUpdate"],
  dashboardSettings: [
    {
      key: "auditChannelId",
      labelKey: "modules.moderation.auditChannel",
      input: "select",
      requiredPermission: "module.moderation.edit"
    },
    {
      key: "defaultTimeoutMinutes",
      labelKey: "modules.moderation.defaultTimeout",
      input: "number",
      requiredPermission: "module.moderation.edit"
    }
  ],
  permissionRequirements: ["module.moderation.view", "module.moderation.edit", "command.timeout"],
  cacheInvalidation: {
    segments: ["config", "module:moderation"],
    eventType: "guild.config.updated"
  }
};
var builtInModules = [generalModule, moderationModule];
var commandMetadata = new Map(
  builtInModules.flatMap((module) => module.commands).map((metadata) => [metadata.name, metadata])
);
var requireCommandMetadata = (name) => {
  const metadata = commandMetadata.get(name);
  if (metadata === void 0) throw new TypeError(`Command metadata is missing for ${name}.`);
  return metadata;
};
export {
  builtInModules,
  commandMetadata,
  generalModule,
  moderationModule,
  requireCommandMetadata
};
//# sourceMappingURL=index.js.map