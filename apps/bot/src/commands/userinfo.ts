import { type Command } from '@sapphire/framework';
import {
  ApplicationCommandType,
  EmbedBuilder,
  MessageFlags,
  type UserContextMenuCommandInteraction,
} from 'discord.js';
import { requireCommandMetadata } from '@sufbot/discord';
import { SufBotCommand } from '../base-command.js';
import { registrationOptions } from '../registration.js';

export class UserinfoCommand extends SufBotCommand {
  public constructor(context: Command.LoaderContext) {
    super(context, requireCommandMetadata('userinfo'));
  }

  public override registerApplicationCommands(registry: Command.Registry): void {
    const options = registrationOptions();
    registry.registerChatInputCommand(
      (builder) =>
        builder
          .setName(this.name)
          .setDescription(this.description)
          .addUserOption((option) =>
            option.setName('user').setDescription('User to inspect').setRequired(false),
          ),
      options,
    );
    registry.registerContextMenuCommand(
      (builder) => builder.setName('User information').setType(ApplicationCommandType.User),
      options,
    );
  }

  public override chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<unknown> {
    const user = interaction.options.getUser('user') ?? interaction.user;
    return interaction.reply({
      embeds: [this.embedFor(user)],
      flags: MessageFlags.Ephemeral,
    });
  }

  public override contextMenuRun(interaction: UserContextMenuCommandInteraction): Promise<unknown> {
    return interaction.reply({
      embeds: [this.embedFor(interaction.targetUser)],
      flags: MessageFlags.Ephemeral,
    });
  }

  private embedFor(user: {
    id: string;
    username: string;
    displayAvatarURL(): string;
    createdTimestamp: number;
  }): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle(user.username)
      .setThumbnail(user.displayAvatarURL())
      .setColor(0x48a7ff)
      .addFields(
        { name: 'User ID', value: user.id },
        { name: 'Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>` },
      );
  }
}
