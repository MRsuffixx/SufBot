import { Listener } from '@sapphire/framework';
import type { GuildMember } from 'discord.js';

export class GuildMemberAddListener extends Listener {
  public async run(member: GuildMember): Promise<void> {
    if (this.container.sufbot.onboarding === undefined) {
      throw new TypeError('Onboarding service is unavailable.');
    }
    await this.container.sufbot.onboarding.handleMemberAdd(member);
  }
}
