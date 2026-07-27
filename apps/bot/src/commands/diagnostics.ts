import { type Command } from '@sapphire/framework';
import { EmbedBuilder, MessageFlags } from 'discord.js';
import { evaluateBotPermissionDiagnostics, requireCommandMetadata } from '@sufbot/discord';
import { SufBotCommand } from '../base-command.js';

const healthLabel = (healthy: boolean): string => (healthy ? 'Healthy' : 'Unavailable');

export class DiagnosticsCommand extends SufBotCommand {
  public constructor(context: Command.LoaderContext) {
    super(context, requireCommandMetadata('diagnostics'));
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction,
  ): Promise<unknown> {
    if (interaction.guild === null) throw new TypeError('Guild-only command reached a DM.');
    const botMember = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe());
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const [databaseResult, redisHealthy] = await Promise.all([
      this.container.sufbot.prisma.$queryRaw`SELECT 1`.then(
        () => true,
        () => false,
      ),
      this.container.sufbot.cache.ping(),
    ]);
    const diagnostics = evaluateBotPermissionDiagnostics({
      permissionBitfield: botMember.permissions.bitfield,
      highestRolePosition: botMember.roles.highest.position,
    });
    const registration = this.container.sufbot.commandRegistrationStatus;
    const embed = new EmbedBuilder()
      .setTitle('SufBot diagnostics')
      .setDescription(
        'Live checks from this bot process. No credentials or private URLs are shown.',
      )
      .setColor(diagnostics.administrator && databaseResult && redisHealthy ? 0x23c483 : 0xf0a93b)
      .addFields(
        {
          name: 'Bot permission',
          value: diagnostics.administrator ? 'Administrator' : 'Administrator missing',
          inline: true,
        },
        {
          name: 'Role hierarchy',
          value: diagnostics.rolePositionWarning
            ? 'Bot role is near the bottom'
            : `Highest role position ${botMember.roles.highest.position}`,
          inline: true,
        },
        {
          name: 'Commands',
          value: `${registration.status} (${registration.registeredCount}/${registration.discoveredCount})`,
          inline: true,
        },
        { name: 'Database', value: healthLabel(databaseResult), inline: true },
        { name: 'Redis', value: healthLabel(redisHealthy), inline: true },
        {
          name: 'Gateway',
          value: `${Math.max(0, Math.round(interaction.client.ws.ping))} ms`,
          inline: true,
        },
        { name: 'Shard', value: String(interaction.guild.shardId), inline: true },
        {
          name: 'Last configuration sync',
          value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
          inline: true,
        },
      );
    return interaction.editReply({ embeds: [embed] });
  }
}
