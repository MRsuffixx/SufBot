import { Listener } from '@sapphire/framework';
import type { Message, PartialMessage } from 'discord.js';

export class MessageDeleteListener extends Listener {
  public async run(message: Message | PartialMessage): Promise<void> {
    if (message.guildId === null) return;
    if (this.container.sufbot.onboarding === undefined) {
      throw new TypeError('Onboarding service is unavailable.');
    }
    await this.container.sufbot.onboarding.handleMessageDelete(message.guildId, message.id);
  }
}
