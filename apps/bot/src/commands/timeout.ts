import { type Command } from '@sapphire/framework';
import { MessageFlags } from 'discord.js';
import { requireCommandMetadata } from '@sufbot/discord';
import { appendAuditLog } from '@sufbot/database';
import { translate } from '@sufbot/shared';
import { SufBotCommand } from '../base-command.js';

export class TimeoutCommand extends SufBotCommand {
  public constructor(context: Command.LoaderContext) {
    super(context, requireCommandMetadata('timeout'));
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction,
  ): Promise<unknown> {
    if (interaction.guild === null) throw new TypeError('Guild-only command reached a DM.');
    const user = interaction.options.getUser('member', true);
    const minutes = interaction.options.getInteger('minutes', true);
    const suppliedReason = interaction.options.getString('reason')?.trim();
    const reason =
      suppliedReason === undefined || suppliedReason.length === 0
        ? 'No reason provided'
        : suppliedReason;
    if (user.id === interaction.user.id) {
      return interaction.reply({
        content: 'You cannot timeout yourself.',
        flags: MessageFlags.Ephemeral,
      });
    }
    if (user.bot) {
      return interaction.reply({
        content: 'Bots cannot be targeted by this timeout command.',
        flags: MessageFlags.Ephemeral,
      });
    }
    const member = await interaction.guild.members.fetch(user.id);
    const actor = await interaction.guild.members.fetch(interaction.user.id);
    const botMember = interaction.guild.members.me;
    const actorOutranked =
      actor.id !== interaction.guild.ownerId &&
      actor.roles.highest.comparePositionTo(member.roles.highest) <= 0;
    const botOutranked =
      botMember === null || botMember.roles.highest.comparePositionTo(member.roles.highest) <= 0;
    if (
      !member.moderatable ||
      member.id === interaction.guild.ownerId ||
      actorOutranked ||
      botOutranked
    ) {
      return interaction.reply({
        content:
          'That member cannot be timed out because of guild ownership, role hierarchy, or bot permissions.',
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
