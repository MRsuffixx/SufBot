import { Command } from '@sapphire/framework';
import { MessageFlags } from 'discord.js';
import { requireCommandMetadata } from '@sufbot/discord';
import { appendAuditLog } from '@sufbot/database';
import { SufBotCommand } from '../base-command.js';
import { registrationOptions } from '../registration.js';

export class AdminCommand extends SufBotCommand {
  public constructor(context: Command.LoaderContext) {
    super(context, requireCommandMetadata('admin'));
  }

  public override registerApplicationCommands(registry: Command.Registry): void {
    registry.registerChatInputCommand(
      (builder) =>
        builder
          .setName(this.name)
          .setDescription(this.description)
          .addSubcommand((subcommand) =>
            subcommand.setName('reload-config').setDescription('Reload validated config.json.'),
          ),
      registrationOptions(),
    );
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction,
  ): Promise<unknown> {
    const config = this.container.sufbot.reloadConfig();
    await appendAuditLog(this.container.sufbot.prisma, {
      ...(interaction.guildId === null ? {} : { guildId: interaction.guildId }),
      actorDiscordId: interaction.user.id,
      action: 'platform.config.reloaded',
      resourceType: 'ApplicationConfig',
      requestId: interaction.id,
      outcome: 'SUCCESS',
      metadata: { schemaVersion: config.$schemaVersion },
    });
    return interaction.reply({
      content: `Configuration reloaded. Schema version: ${config.$schemaVersion}.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

