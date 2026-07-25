import { Command } from '@sapphire/framework';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { builtInModules, requireCommandMetadata } from '@sufbot/discord';
import { SufBotCommand } from '../base-command.js';
import { registrationOptions } from '../registration.js';

export class HelpCommand extends SufBotCommand {
  public constructor(context: Command.LoaderContext) {
    super(context, requireCommandMetadata('help'));
  }

  public override registerApplicationCommands(registry: Command.Registry): void {
    registry.registerChatInputCommand(
      (builder) => builder.setName(this.name).setDescription(this.description),
      registrationOptions(),
    );
  }

  public override chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<unknown> {
    const embed = new EmbedBuilder()
      .setTitle('SufBot command center')
      .setDescription('Commands are checked against server modules and permissions at runtime.')
      .setColor(0x7c5cff)
      .addFields(
        builtInModules.map((module) => ({
          name: module.metadata.name,
          value: module.commands.map((command) => `\`/${command.name}\``).join(' · '),
        })),
      );
    const components = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`sufbot:help:details:${interaction.user.id}`)
        .setLabel('How permissions work')
        .setStyle(ButtonStyle.Secondary),
    );
    return interaction.reply({
      embeds: [embed],
      components: [components],
      flags: MessageFlags.Ephemeral,
    });
  }
}
