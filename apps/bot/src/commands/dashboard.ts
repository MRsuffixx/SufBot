import { type Command } from '@sapphire/framework';
import { ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import { requireCommandMetadata } from '@sufbot/discord';
import { SufBotCommand } from '../base-command.js';

export class DashboardCommand extends SufBotCommand {
  public constructor(context: Command.LoaderContext) {
    super(context, requireCommandMetadata('dashboard'));
  }

  public override chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<unknown> {
    if (interaction.guildId === null) throw new TypeError('Guild-only command reached a DM.');
    const url = new URL(
      `/dashboard/guilds/${interaction.guildId}`,
      this.container.sufbot.config.application.websiteUrl,
    );
    const components = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel('Open Dashboard')
        .setStyle(ButtonStyle.Link)
        .setURL(url.toString()),
    );
    return interaction.reply({
      content: 'Open the authenticated dashboard for this server.',
      components: [components],
      flags: MessageFlags.Ephemeral,
    });
  }
}
