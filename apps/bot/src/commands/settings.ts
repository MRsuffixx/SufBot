import { type Command } from '@sapphire/framework';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  StringSelectMenuBuilder,
} from 'discord.js';
import { requireCommandMetadata } from '@sufbot/discord';
import { SufBotCommand } from '../base-command.js';
import { registrationOptions } from '../registration.js';

export class SettingsCommand extends SufBotCommand {
  public constructor(context: Command.LoaderContext) {
    super(context, requireCommandMetadata('settings'));
  }

  public override registerApplicationCommands(registry: Command.Registry): void {
    registry.registerChatInputCommand(
      (builder) => builder.setName(this.name).setDescription(this.description),
      registrationOptions(),
    );
  }

  public override chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<unknown> {
    if (interaction.guildId === null) throw new TypeError('Guild-only command reached a DM.');
    const suffix = `${interaction.guildId}:${interaction.user.id}`;
    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`sufbot:settings:prefix:${suffix}`)
        .setLabel('Edit command prefix')
        .setStyle(ButtonStyle.Primary),
    );
    const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`sufbot:settings:language:${suffix}`)
        .setPlaceholder('Choose server language')
        .addOptions(
          { label: 'English', value: 'en', emoji: '🇬🇧' },
          { label: 'Türkçe', value: 'tr', emoji: '🇹🇷' },
        ),
    );
    return interaction.reply({
      content:
        'Choose a setting. Changes are validated, audited, and published to every bot process.',
      components: [buttonRow, selectRow],
      flags: MessageFlags.Ephemeral,
    });
  }
}
