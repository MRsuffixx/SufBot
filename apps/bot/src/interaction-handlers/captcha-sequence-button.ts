import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';

export class CaptchaSequenceButtonHandler extends InteractionHandler {
  public constructor(
    context: InteractionHandler.LoaderContext,
    options: InteractionHandler.Options,
  ) {
    super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.Button });
  }

  public override parse(interaction: ButtonInteraction) {
    const match = /^captcha:v1:sequence:([A-Za-z0-9_-]{24}):([0-4]):([A-Za-z0-9_-]{22})$/u.exec(
      interaction.customId,
    );
    return match === null
      ? this.none()
      : this.some({
          challengeId: match[1],
          choice: Number(match[2]),
          signature: match[3],
        });
  }

  public async run(
    interaction: ButtonInteraction,
    data: { challengeId: string; choice: number; signature: string },
  ): Promise<unknown> {
    if (this.container.sufbot.onboarding === undefined) {
      throw new TypeError('Onboarding service is unavailable.');
    }
    return this.container.sufbot.onboarding.handleCaptchaSequence(
      interaction,
      data.challengeId,
      data.choice,
      data.signature,
    );
  }
}
