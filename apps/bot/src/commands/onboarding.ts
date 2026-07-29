import { type Command } from '@sapphire/framework';
import { MessageFlags } from 'discord.js';
import { requireCommandMetadata } from '@sufbot/discord';
import { OnboardingRepository } from '@sufbot/onboarding';
import { SufBotCommand } from '../base-command.js';

export class OnboardingCommand extends SufBotCommand {
  public constructor(context: Command.LoaderContext) {
    super(context, requireCommandMetadata('onboarding'));
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction,
  ): Promise<unknown> {
    if (interaction.guildId === null) throw new TypeError('Guild-only command reached a DM.');
    const service = this.container.sufbot.onboarding;
    if (service === undefined) throw new TypeError('Onboarding service is unavailable.');
    const config = await new OnboardingRepository(
      this.container.sufbot.prisma,
      this.container.sufbot.cache,
    ).get(interaction.guildId);
    const subcommand = interaction.options.getSubcommand();
    const dashboard = `${this.container.sufbot.config.application.websiteUrl}/dashboard/guilds/${interaction.guildId}/onboarding`;
    if (subcommand === 'status') {
      const plan = await this.container.sufbot.entitlements.getGuildLimits(interaction.guildId);
      return interaction.reply({
        content: [
          `Verification: **${config.verificationEnabled ? config.resourceHealth : 'DISABLED'}**`,
          `Welcome: **${config.welcomeEnabled ? 'ENABLED' : 'DISABLED'}**`,
          `Goodbye: **${config.goodbyeEnabled ? 'ENABLED' : 'DISABLED'}**`,
          `Auto roles: **${config.autoRoleEnabled ? 'ENABLED' : 'DISABLED'}**`,
          `Plan: **${plan.tier.toUpperCase()}** · ${plan.limits.autoRoles} automatic roles`,
          `Dashboard: ${dashboard}`,
        ].join('\n'),
        flags: MessageFlags.Ephemeral,
      });
    }
    if (subcommand === 'setup' || subcommand === 'repair') {
      return interaction.reply({
        content: `${subcommand === 'setup' ? 'Review and confirm setup' : 'Inspect and repair the existing setup'} at ${dashboard}/verification`,
        flags: MessageFlags.Ephemeral,
      });
    }
    if (subcommand === 'test-verification') {
      const panel =
        config.verificationChannelId === null || config.verificationMessageId === null
          ? null
          : `https://discord.com/channels/${interaction.guildId}/${config.verificationChannelId}/${config.verificationMessageId}`;
      return interaction.reply({
        content:
          config.resourceHealth === 'HEALTHY' && panel !== null
            ? `Verification setup is healthy. Panel: ${panel}`
            : `Verification setup is ${config.resourceHealth}. Repair it at ${dashboard}/verification`,
        flags: MessageFlags.Ephemeral,
      });
    }
    if (subcommand === 'test-welcome' || subcommand === 'test-goodbye') {
      await service.enqueueAdministratorTest(
        interaction.guildId,
        interaction.user.id,
        interaction.id,
        subcommand === 'test-welcome' ? 'WELCOME_CHANNEL' : 'GOODBYE_CHANNEL',
      );
      return interaction.reply({
        content: `The audited ${subcommand === 'test-welcome' ? 'welcome' : 'goodbye'} test was queued.`,
        flags: MessageFlags.Ephemeral,
      });
    }
    const target = interaction.options.getUser('member', true);
    await service.setManualVerification(
      interaction.guildId,
      target.id,
      interaction.user.id,
      subcommand === 'verify-user',
      interaction.id,
    );
    return interaction.reply({
      content:
        subcommand === 'verify-user'
          ? `<@${target.id}> was marked verified; assignable roles are being reconciled.`
          : `Verification was revoked for <@${target.id}>.`,
      allowedMentions: { parse: [], users: [], roles: [], repliedUser: false },
      flags: MessageFlags.Ephemeral,
    });
  }
}
