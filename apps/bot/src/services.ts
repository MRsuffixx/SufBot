import { z } from 'zod';
import type { ChatInputCommandInteraction, ContextMenuCommandInteraction } from 'discord.js';
import type { DistributedCache } from '@sufbot/cache';
import { EntitlementService } from '@sufbot/billing';
import { loadAppConfig, type AppConfig, type BotEnvironment } from '@sufbot/config';
import type { PrismaClient } from '@sufbot/database/generated';
import type { Logger } from '@sufbot/logger';
import type { PlatformRole } from '@sufbot/permissions';
import { CommandRegistrationStatusSchema, type CommandRegistrationStatus } from '@sufbot/discord';
import type { GuildStatusService } from './guild-status.js';

const AuthorizationStateSchema = z.object({
  enabledModules: z.array(z.string()),
  featureFlags: z.array(z.string()),
  rolePermissions: z.record(z.string(), z.array(z.string())),
});

const CompleteAuthorizationStateSchema = AuthorizationStateSchema.extend({
  entitlements: z.array(z.string()),
});

type CommandInteraction = ChatInputCommandInteraction | ContextMenuCommandInteraction;

export class CooldownService {
  readonly #expirations = new Map<string, number>();

  public claim(
    key: string,
    seconds: number,
  ): { allowed: true } | { allowed: false; retryAfterMs: number } {
    const now = Date.now();
    const expiresAt = this.#expirations.get(key) ?? 0;
    if (expiresAt > now) return { allowed: false, retryAfterMs: expiresAt - now };
    this.#expirations.set(key, now + seconds * 1000);
    if (this.#expirations.size > 50_000) {
      for (const [storedKey, expiry] of this.#expirations) {
        if (expiry <= now) this.#expirations.delete(storedKey);
      }
    }
    return { allowed: true };
  }
}

export class BotServices {
  public readonly cooldowns = new CooldownService();
  public entitlements: EntitlementService;
  public config: AppConfig;
  public guildStatus: GuildStatusService | undefined;
  #commandRegistrationStatus: CommandRegistrationStatus = CommandRegistrationStatusSchema.parse({
    status: 'unknown',
    mode: 'disabled',
    discoveredCount: 0,
    registeredCount: 0,
    commandNames: [],
  });

  public constructor(
    public readonly env: BotEnvironment,
    public readonly prisma: PrismaClient,
    public readonly cache: DistributedCache,
    public readonly logger: Logger,
    config: AppConfig,
  ) {
    this.config = config;
    this.entitlements = new EntitlementService(prisma, config, cache);
  }

  public reloadConfig(): AppConfig {
    this.config = loadAppConfig({ reload: true });
    this.entitlements = new EntitlementService(this.prisma, this.config, this.cache);
    return this.config;
  }

  public get commandRegistrationStatus(): CommandRegistrationStatus {
    return this.#commandRegistrationStatus;
  }

  public setCommandRegistrationStatus(status: CommandRegistrationStatus): void {
    this.#commandRegistrationStatus = CommandRegistrationStatusSchema.parse(status);
  }

  public platformRoleFor(discordUserId: string): PlatformRole {
    if (this.env.BOT_OWNER_DISCORD_IDS.includes(discordUserId)) return 'OWNER';
    if (this.env.BOT_DEVELOPER_DISCORD_IDS.includes(discordUserId)) return 'DEVELOPER';
    if (this.env.PLATFORM_ADMIN_DISCORD_IDS.includes(discordUserId)) return 'ADMIN';
    return 'USER';
  }

  public async authorizationState(
    guildId: string,
  ): Promise<z.infer<typeof CompleteAuthorizationStateSchema>> {
    const [authorization, entitlements] = await Promise.all([
      this.cache.getOrLoad(guildId, 'authorization', AuthorizationStateSchema, async () => {
        const [modules, flags, rolePermissions] = await Promise.all([
          this.prisma.guildModule.findMany({
            where: { guildId, enabled: true },
            select: { moduleKey: true },
          }),
          this.prisma.featureFlag.findMany({
            where: {
              enabled: true,
              OR: [{ scopeKey: 'platform' }, { guildId }],
            },
            select: { key: true },
          }),
          this.prisma.guildRolePermission.findMany({
            where: { guildId },
            select: { discordRoleId: true, permissions: true },
          }),
        ]);
        const enabled = new Set(modules.map((module) => module.moduleKey));
        enabled.add('general');
        return {
          enabledModules: [...enabled],
          featureFlags: flags.map((flag) => flag.key),
          rolePermissions: Object.fromEntries(
            rolePermissions.map((permission) => [permission.discordRoleId, permission.permissions]),
          ),
        };
      }),
      this.entitlements.listGuildEntitlements(guildId),
    ]);
    return CompleteAuthorizationStateSchema.parse({
      ...authorization,
      entitlements: entitlements.map((entitlement) => entitlement.key),
    });
  }

  public async localeForGuild(guildId: string | null): Promise<'en' | 'tr'> {
    if (guildId === null) return this.config.application.defaultLocale;
    const schema = z.object({ locale: z.enum(['en', 'tr']) });
    const settings = await this.cache.getOrLoad(guildId, 'config', schema, async () => {
      const stored = await this.prisma.guildSettings.findUnique({
        where: { guildId },
        select: { locale: true },
      });
      return { locale: stored?.locale === 'tr' ? 'tr' : 'en' };
    });
    return settings.locale === 'tr' ? 'tr' : 'en';
  }

  public rolePermissions(
    interaction: CommandInteraction,
    rolePermissions: Readonly<Record<string, readonly string[]>>,
  ): ReadonlySet<string> {
    if (!interaction.inGuild() || interaction.member === null) return new Set();
    const roleIds = Array.isArray(interaction.member.roles)
      ? interaction.member.roles
      : [...interaction.member.roles.cache.keys()];
    return new Set(roleIds.flatMap((roleId) => rolePermissions[roleId] ?? []));
  }
}
