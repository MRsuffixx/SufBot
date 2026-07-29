import { Listener } from '@sapphire/framework';
import type { Role } from 'discord.js';

export class RoleDeleteListener extends Listener {
  public async run(role: Role): Promise<void> {
    if (this.container.sufbot.onboarding === undefined) {
      throw new TypeError('Onboarding service is unavailable.');
    }
    await this.container.sufbot.onboarding.handleRoleDelete(role.guild.id, role.id);
  }
}
