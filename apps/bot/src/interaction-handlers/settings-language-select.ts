import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import {
  MessageFlags,
  PermissionFlagsBits,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { GuildRepository } from '@sufbot/database';

export class SettingsLanguageSelectHandler extends InteractionHandler {
  public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
    super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.SelectMenu });
  }

  public override parse(interaction: StringSelectMenuInteraction) {
    const match = /^sufbot:settings:language:(\d{17,20}):(\d{17,20})$/.exec(interaction.customId);
    if (match === null || match[2] !== interaction.user.id || match[1] !== interaction.guildId) {
      return this.none();
    }
    return this.some({ guildId: match[1] });
  }

  public async run(
    interaction: StringSelectMenuInteraction,
    data: { guildId: string },
  ): Promise<unknown> {
    if (
      interaction.memberPermissions === null ||
      (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild) &&
        interaction.guild?.ownerId !== interaction.user.id)
    ) {
      return interaction.reply({ content: 'Manage Server is required.', flags: MessageFlags.Ephemeral });
    }
    const locale = interaction.values[0];
    if (locale !== 'en' && locale !== 'tr') {
      return interaction.reply({ content: 'Unsupported language.', flags: MessageFlags.Ephemeral });
    }
    const repository = new GuildRepository(this.container.sufbot.prisma);
    const updated = await repository.updateSettings(
      data.guildId,
      { locale },
      { discordUserId: interaction.user.id, requestId: interaction.id },
    );
    await this.container.sufbot.cache.publish({
      type: 'guild.config.updated',
      guildId: data.guildId,
      version: updated.version,
      timestamp: new Date().toISOString(),
    });
    return interaction.update({
      content: locale === 'tr' ? 'Sunucu dili Türkçe oldu.' : 'Server language is now English.',
      components: [],
    });
  }
}

