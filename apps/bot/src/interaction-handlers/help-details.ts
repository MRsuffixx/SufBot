import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type ButtonInteraction } from 'discord.js';

export class HelpDetailsHandler extends InteractionHandler {
  public constructor(
    context: InteractionHandler.LoaderContext,
    options: InteractionHandler.Options,
  ) {
    super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.Button });
  }

  public override parse(interaction: ButtonInteraction) {
    const match = /^sufbot:help:details:(\d{17,20})$/.exec(interaction.customId);
    if (match === null || match[1] !== interaction.user.id) return this.none();
    return this.some();
  }

  public async run(interaction: ButtonInteraction): Promise<unknown> {
    return interaction.reply({
      content:
        'SufBot re-checks user permissions, bot permissions, module state, feature flags, and privileged allowlists every time a command runs.',
      flags: MessageFlags.Ephemeral,
    });
  }
}
