import { type Command } from '@sapphire/framework';
import { MessageFlags } from 'discord.js';
import { requireCommandMetadata } from '@sufbot/discord';
import { GuildRepository } from '@sufbot/database';
import { translate } from '@sufbot/shared';
import { SufBotCommand } from '../base-command.js';

const languages = [
  { name: 'English', value: 'en' },
  { name: 'Türkçe', value: 'tr' },
] as const;

export class ConfigCommand extends SufBotCommand {
  public constructor(context: Command.LoaderContext) {
    super(context, requireCommandMetadata('config'));
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction,
  ): Promise<unknown> {
    if (interaction.guildId === null) throw new TypeError('Guild-only command reached a DM.');
    const repository = new GuildRepository(this.container.sufbot.prisma);
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'view') {
      const settings = await repository.getSettings(interaction.guildId);
      return interaction.reply({
        content: [
          `Language: **${settings?.locale ?? 'en'}**`,
          `Timezone: **${settings?.timezone ?? 'UTC'}**`,
          `Prefix: **${settings?.commandPrefix ?? '!'}**`,
          `Version: **${settings?.version ?? 1}**`,
        ].join('\n'),
        flags: MessageFlags.Ephemeral,
      });
    }
    const language = interaction.options.getString('language', true);
    if (language !== 'en' && language !== 'tr') {
      return interaction.reply({ content: 'Unsupported language.', flags: MessageFlags.Ephemeral });
    }
    const updated = await repository.updateSettings(
      interaction.guildId,
      { locale: language },
      {
        discordUserId: interaction.user.id,
        requestId: interaction.id,
      },
    );
    await this.container.sufbot.cache.publish({
      type: 'guild.config.updated',
      guildId: interaction.guildId,
      version: updated.version,
      timestamp: new Date().toISOString(),
    });
    return interaction.reply({
      content: translate(language, 'commands.config.languageUpdated'),
      flags: MessageFlags.Ephemeral,
    });
  }

  public override autocompleteRun(interaction: Command.AutocompleteInteraction): Promise<void> {
    const focused = interaction.options.getFocused().toLocaleLowerCase();
    return interaction.respond(
      languages.filter((language) => language.name.toLocaleLowerCase().includes(focused)),
    );
  }
}
