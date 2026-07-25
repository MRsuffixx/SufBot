import { Listener } from '@sapphire/framework';
import type { Guild } from 'discord.js';

export class GuildDeleteListener extends Listener {
  public async run(guild: Guild): Promise<void> {
    await this.container.sufbot.prisma.guild.updateMany({
      where: { id: guild.id },
      data: { botInstalled: false, leftAt: new Date() },
    });
    await this.container.sufbot.cache.invalidate(guild.id);
    this.container.sufbot.logger.info({ guildId: guild.id }, 'guild uninstalled');
  }
}

