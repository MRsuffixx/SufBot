import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, PermissionFlagsBits, type ModalSubmitInteraction } from 'discord.js';
import { GuildRepository } from '@sufbot/database';

export class SettingsPrefixModalHandler extends InteractionHandler {
  public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
    super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.ModalSubmit });
  }

  public override parse(interaction: ModalSubmitInteraction) {
    const match = /^sufbot:settings:prefix-modal:(\d{17,20}):(\d{17,20})$/.exec(
      interaction.customId,
    );
    if (match === null || match[2] !== interaction.user.id || match[1] !== interaction.guildId) {
      return this.none();
    }
    return this.some({ guildId: match[1] });
  }

  public async run(
    interaction: ModalSubmitInteraction,
    data: { guildId: string },
  ): Promise<unknown> {
    if (
      interaction.memberPermissions === null ||
      (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild) &&
        interaction.guild?.ownerId !== interaction.user.id)
    ) {
      return interaction.reply({ content: 'Manage Server is required.', flags: MessageFlags.Ephemeral });
    }
    const prefix = interaction.fields.getTextInputValue('prefix').trim();
    if (prefix.length < 1 || prefix.length > 5 || /[\r\n]/.test(prefix)) {
      return interaction.reply({ content: 'Prefix must be 1–5 visible characters.', flags: MessageFlags.Ephemeral });
    }
    const repository = new GuildRepository(this.container.sufbot.prisma);
    const updated = await repository.updateSettings(
      data.guildId,
      { commandPrefix: prefix },
      { discordUserId: interaction.user.id, requestId: interaction.id },
    );
    await this.container.sufbot.cache.publish({
      type: 'guild.config.updated',
      guildId: data.guildId,
      version: updated.version,
      timestamp: new Date().toISOString(),
    });
    return interaction.reply({ content: `Prefix changed to \`${prefix}\`.`, flags: MessageFlags.Ephemeral });
  }
}

