import { Command } from '@sapphire/framework';
import { MessageFlags } from 'discord.js';
import { requireCommandMetadata } from '@sufbot/discord';
import { translate } from '@sufbot/shared';
import { SufBotCommand } from '../base-command.js';
import { registrationOptions } from '../registration.js';

export class PingCommand extends SufBotCommand {
  public constructor(context: Command.LoaderContext) {
    super(context, requireCommandMetadata('ping'));
  }

  public override registerApplicationCommands(registry: Command.Registry): void {
    registry.registerChatInputCommand(
      (builder) => builder.setName(this.name).setDescription(this.description),
      registrationOptions(),
    );
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction,
  ): Promise<unknown> {
    const startedAt = Date.now();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const locale = await this.container.sufbot.localeForGuild(interaction.guildId);
    return interaction.editReply(
      translate(locale, 'commands.ping.response', {
        gateway: Math.max(0, Math.round(interaction.client.ws.ping)),
        roundtrip: Date.now() - startedAt,
      }),
    );
  }
}

