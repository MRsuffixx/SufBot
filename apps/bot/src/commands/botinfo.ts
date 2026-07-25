import { Command } from '@sapphire/framework';
import { EmbedBuilder, MessageFlags } from 'discord.js';
import { requireCommandMetadata } from '@sufbot/discord';
import { SufBotCommand } from '../base-command.js';
import { registrationOptions } from '../registration.js';

export class BotinfoCommand extends SufBotCommand {
  public constructor(context: Command.LoaderContext) {
    super(context, requireCommandMetadata('botinfo'));
  }

  public override registerApplicationCommands(registry: Command.Registry): void {
    registry.registerChatInputCommand(
      (builder) => builder.setName(this.name).setDescription(this.description),
      registrationOptions(),
    );
  }

  public override chatInputRun(
    interaction: Command.ChatInputCommandInteraction,
  ): Promise<unknown> {
    const config = this.container.sufbot.config;
    const embed = new EmbedBuilder()
      .setTitle(config.application.name)
      .setDescription(config.application.description)
      .setColor(0x7c5cff)
      .addFields(
        { name: 'Guilds', value: String(interaction.client.guilds.cache.size), inline: true },
        { name: 'Shard', value: String(interaction.guild?.shardId ?? 0), inline: true },
        { name: 'Uptime', value: `${Math.floor(process.uptime() / 60)} min`, inline: true },
        { name: 'Creator', value: config.application.ownerName, inline: true },
      );
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}

