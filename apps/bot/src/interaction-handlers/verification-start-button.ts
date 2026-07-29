import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';

export class VerificationStartButtonHandler extends InteractionHandler {
  public constructor(
    context: InteractionHandler.LoaderContext,
    options: InteractionHandler.Options,
  ) {
    super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.Button });
  }

  public override parse(interaction: ButtonInteraction) {
    const match = /^verify:v1:([A-Za-z0-9_-]{22}):([A-Za-z0-9_-]{22})$/u.exec(
      interaction.customId,
    );
    return match === null ? this.none() : this.some({ nonce: match[1], signature: match[2] });
  }

  public async run(
    interaction: ButtonInteraction,
    data: { nonce: string; signature: string },
  ): Promise<unknown> {
    if (this.container.sufbot.onboarding === undefined) {
      throw new TypeError('Onboarding service is unavailable.');
    }
    return this.container.sufbot.onboarding.handleVerificationStart(
      interaction,
      data.nonce,
      data.signature,
    );
  }
}
