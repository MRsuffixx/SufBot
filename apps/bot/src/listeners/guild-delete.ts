import { Listener } from '@sapphire/framework';
import type { Guild } from 'discord.js';

export class GuildDeleteListener extends Listener {
  public async run(guild: Guild): Promise<void> {
    if (this.container.sufbot.guildStatus === undefined) {
      throw new TypeError('Guild status service is unavailable.');
    }
    await this.container.sufbot.guildStatus.removeGuild(guild.id, 'guild-delete');
    this.container.sufbot.logger.info({ guildId: guild.id }, 'guild uninstalled');
  }
}
