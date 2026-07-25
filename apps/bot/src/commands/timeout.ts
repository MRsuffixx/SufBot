import { Command } from '@sapphire/framework';
import { MessageFlags } from 'discord.js';
import { requireCommandMetadata } from '@sufbot/discord';
import { appendAuditLog } from '@sufbot/database';
import { translate } from '@sufbot/shared';
import { SufBotCommand } from '../base-command.js';
import { registrationOptions } from '../registration.js';

export class TimeoutCommand extends SufBotCommand {
  public constructor(context: Command.LoaderContext) {
    super(context, requireCommandMetadata('timeout'));
  }

  public override registerApplicationCommands(registry: Command.Registry): void {
    registry.registerChatInputCommand(
      (builder) =>
        builder
          .setName(this.name)
          .setDescription(this.description)
          .addUserOption((option) =>
            option.setName('member').setDescription('Member to timeout').setRequired(true),
          )
          .addIntegerOption((option) =>
            option
              .setName('minutes')
              .setDescription('Timeout duration in minutes')
              .setMinValue(1)
              .setMaxValue(40_320)
              .setRequired(true),
          )
          .addStringOption((option) =>
            option
              .setName('reason')
              .setDescription('Audit reason')
              .setMaxLength(300)
              .setRequired(false),
          ),
      registrationOptions(),
    );
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction,
  ): Promise<unknown> {
    if (interaction.guild === null) throw new TypeError('Guild-only command reached a DM.');
    const user = interaction.options.getUser('member', true);
    const minutes = interaction.options.getInteger('minutes', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    const member = await interaction.guild.members.fetch(user.id);
    if (!member.moderatable || member.id === interaction.guild.ownerId) {
      return interaction.reply({
        content: 'I cannot timeout that member. Check role hierarchy and bot permissions.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await member.timeout(minutes * 60_000, `${reason} · actor ${interaction.user.id}`);
    await appendAuditLog(this.container.sufbot.prisma, {
      guildId: interaction.guild.id,
      actorDiscordId: interaction.user.id,
      action: 'moderation.member.timeout',
      resourceType: 'DiscordMember',
      resourceId: user.id,
      requestId: interaction.id,
      outcome: 'SUCCESS',
      newValue: { minutes, reason },
    });
    const locale = await this.container.sufbot.localeForGuild(interaction.guild.id);
    return interaction.editReply(
      translate(locale, 'commands.timeout.success', { user: `<@${user.id}>`, minutes }),
    );
  }
}

