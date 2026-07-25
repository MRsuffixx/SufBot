import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
} from 'discord.js';

export class SettingsPrefixButtonHandler extends InteractionHandler {
  public constructor(
    context: InteractionHandler.LoaderContext,
    options: InteractionHandler.Options,
  ) {
    super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.Button });
  }

  public override parse(interaction: ButtonInteraction) {
    const match = /^sufbot:settings:prefix:(\d{17,20}):(\d{17,20})$/.exec(interaction.customId);
    if (match === null || match[2] !== interaction.user.id || match[1] !== interaction.guildId) {
      return this.none();
    }
    return this.some({ guildId: match[1] });
  }

  public async run(interaction: ButtonInteraction, data: { guildId: string }): Promise<unknown> {
    const modal = new ModalBuilder()
      .setCustomId(`sufbot:settings:prefix-modal:${data.guildId}:${interaction.user.id}`)
      .setTitle('Edit command prefix')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('prefix')
            .setLabel('Prefix (1–5 characters)')
            .setStyle(TextInputStyle.Short)
            .setMinLength(1)
            .setMaxLength(5)
            .setRequired(true),
        ),
      );
    return interaction.showModal(modal);
  }
}
