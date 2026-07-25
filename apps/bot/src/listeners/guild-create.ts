import { Listener } from '@sapphire/framework';
import type { Guild } from 'discord.js';

export class GuildCreateListener extends Listener {
  public async run(guild: Guild): Promise<void> {
    await this.container.sufbot.prisma.$transaction(async (transaction) => {
      await transaction.guild.upsert({
        where: { id: guild.id },
        create: {
          id: guild.id,
          name: guild.name,
          iconHash: guild.icon,
          ownerDiscordId: guild.ownerId,
          botInstalled: true,
        },
        update: {
          name: guild.name,
          iconHash: guild.icon,
          ownerDiscordId: guild.ownerId,
          botInstalled: true,
          leftAt: null,
        },
      });
      await transaction.guildSettings.upsert({
        where: { guildId: guild.id },
        create: {
          guildId: guild.id,
          locale: this.container.sufbot.config.application.defaultLocale,
          commandPrefix: this.container.sufbot.config.discord.defaultPrefix,
        },
        update: {},
      });
      for (const moduleKey of ['general', 'moderation']) {
        await transaction.guildModule.upsert({
          where: { guildId_moduleKey: { guildId: guild.id, moduleKey } },
          create: { guildId: guild.id, moduleKey, enabled: moduleKey === 'general' },
          update: {},
        });
      }
    });
    this.container.sufbot.logger.info({ guildId: guild.id }, 'guild installed');
  }
}

