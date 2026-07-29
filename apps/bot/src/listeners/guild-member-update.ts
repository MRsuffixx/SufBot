import { Listener } from '@sapphire/framework';
import type { GuildMember } from 'discord.js';

export class GuildMemberUpdateListener extends Listener {
  public async run(previous: GuildMember, member: GuildMember): Promise<void> {
    if (this.container.sufbot.onboarding === undefined) {
      throw new TypeError('Onboarding service is unavailable.');
    }
    await this.container.sufbot.onboarding.handleMemberUpdate(previous, member);
  }
}
