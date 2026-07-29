import { type Command } from '@sapphire/framework';
import { MessageFlags } from 'discord.js';
import { requireCommandMetadata } from '@sufbot/discord';
import { OnboardingRepository } from '@sufbot/onboarding';
import { SufBotCommand } from '../base-command.js';

export class VerifyCommand extends SufBotCommand {
  public constructor(context: Command.LoaderContext) {
    super(context, requireCommandMetadata('verify'));
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction,
  ): Promise<unknown> {
    if (interaction.guildId === null) throw new TypeError('Guild-only command reached a DM.');
    const config = await new OnboardingRepository(
      this.container.sufbot.prisma,
      this.container.sufbot.cache,
    ).get(interaction.guildId);
    const existing = await this.container.sufbot.prisma.memberVerification.findUnique({
      where: {
        guildId_userId: { guildId: interaction.guildId, userId: interaction.user.id },
      },
      select: { captchaVerified: true, rolesGranted: true },
    });
    if (existing?.captchaVerified === true && existing.rolesGranted) {
      return interaction.reply({
        content: 'You are already verified.',
        flags: MessageFlags.Ephemeral,
      });
    }
    if (
      !config.verificationEnabled ||
      config.resourceHealth !== 'HEALTHY' ||
      config.verificationChannelId === null ||
      config.verificationMessageId === null
    ) {
      return interaction.reply({
        content: 'Verification is not currently available. Ask a server administrator for help.',
        flags: MessageFlags.Ephemeral,
      });
    }
    return interaction.reply({
      content: `Use the server verification panel: https://discord.com/channels/${interaction.guildId}/${config.verificationChannelId}/${config.verificationMessageId}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
