import { Precondition, type Command } from '@sapphire/framework';
import type { ChatInputCommandInteraction, ContextMenuCommandInteraction } from 'discord.js';
import { canExecuteCommand, type AuthorizationContext } from '@sufbot/permissions';
import { requireCommandMetadata } from '@sufbot/discord';

type SupportedInteraction = ChatInputCommandInteraction | ContextMenuCommandInteraction;

export class AuthorizedPrecondition extends Precondition {
  public override chatInputRun(
    interaction: ChatInputCommandInteraction,
    command: Command,
  ) {
    return this.authorize(interaction, command.name);
  }

  public override contextMenuRun(
    interaction: ContextMenuCommandInteraction,
    command: Command,
  ) {
    return this.authorize(interaction, command.name);
  }

  private async authorize(interaction: SupportedInteraction, commandName: string) {
    const metadata = requireCommandMetadata(commandName);
    const state =
      interaction.guildId === null
        ? {
            enabledModules: ['general'],
            featureFlags: [] as string[],
            premium: false,
            rolePermissions: {},
          }
        : await this.container.sufbot.authorizationState(interaction.guildId);
    const context: AuthorizationContext = {
      userId: interaction.user.id,
      discordUserId: interaction.user.id,
      platformRole: this.container.sufbot.platformRoleFor(interaction.user.id),
      ...(interaction.guildId === null ? {} : { guildId: interaction.guildId }),
      ...(interaction.guild === null ? {} : { guildOwnerDiscordId: interaction.guild.ownerId }),
      userPermissions: interaction.memberPermissions?.bitfield ?? 0n,
      botPermissions: interaction.guild?.members.me?.permissions.bitfield ?? 0n,
      customPermissions: this.container.sufbot.rolePermissions(
        interaction,
        state.rolePermissions,
      ),
      enabledModules: new Set(state.enabledModules),
      premium: state.premium,
      featureFlags: new Set(state.featureFlags),
    };
    const decision = canExecuteCommand(context, metadata);
    if (!decision.allowed) {
      return this.error({ identifier: decision.code, message: decision.reason });
    }

    const userCooldown = this.container.sufbot.cooldowns.claim(
      `user:${interaction.user.id}:${metadata.name}`,
      metadata.cooldownSeconds,
    );
    if (!userCooldown.allowed) {
      return this.error({
        identifier: 'USER_COOLDOWN',
        message: `Try again in ${Math.ceil(userCooldown.retryAfterMs / 1000)} second(s).`,
      });
    }
    if (metadata.perGuildCooldownSeconds !== undefined && interaction.guildId !== null) {
      const guildCooldown = this.container.sufbot.cooldowns.claim(
        `guild:${interaction.guildId}:${metadata.name}`,
        metadata.perGuildCooldownSeconds,
      );
      if (!guildCooldown.allowed) {
        return this.error({
          identifier: 'GUILD_COOLDOWN',
          message: `This server must wait ${Math.ceil(guildCooldown.retryAfterMs / 1000)} second(s).`,
        });
      }
    }
    return this.ok();
  }
}

