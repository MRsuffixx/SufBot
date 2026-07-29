import { Listener } from '@sapphire/framework';
import type { DMChannel, NonThreadGuildBasedChannel } from 'discord.js';

export class ChannelDeleteListener extends Listener {
  public async run(channel: DMChannel | NonThreadGuildBasedChannel): Promise<void> {
    if (channel.isDMBased()) return;
    if (this.container.sufbot.onboarding === undefined) {
      throw new TypeError('Onboarding service is unavailable.');
    }
    await this.container.sufbot.onboarding.handleChannelDelete(channel.guild.id, channel.id);
  }
}
