import { type Command } from '@sapphire/framework';
import { EmbedBuilder, MessageFlags } from 'discord.js';
import { requireCommandMetadata } from '@sufbot/discord';
import { SufBotCommand } from '../base-command.js';

export class ServerinfoCommand extends SufBotCommand {
  public constructor(context: Command.LoaderContext) {
    super(context, requireCommandMetadata('serverinfo'));
  }

  public override chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<unknown> {
    const guild = interaction.guild;
    if (guild === null)
      return interaction.reply({ content: 'Guild not found.', flags: MessageFlags.Ephemeral });
    const embed = new EmbedBuilder()
      .setTitle(guild.name)
      .setThumbnail(guild.iconURL())
      .setColor(0x23c483)
      .addFields(
        { name: 'Members', value: String(guild.memberCount), inline: true },
        { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
        {
          name: 'Created',
          value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`,
          inline: true,
        },
        { name: 'Guild ID', value: guild.id },
      );
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}
