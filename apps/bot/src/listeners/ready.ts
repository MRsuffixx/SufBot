import { Listener } from '@sapphire/framework';
import type { Client } from 'discord.js';

export class ReadyListener extends Listener {
  public constructor(context: Listener.LoaderContext, options: Listener.Options) {
    super(context, { ...options, once: true, event: 'clientReady' });
  }

  public run(client: Client<true>): void {
    this.container.sufbot.logger.info(
      {
        botUserId: client.user.id,
        guildCount: client.guilds.cache.size,
        shardCount: client.ws.shards.size,
      },
      'SufBot Discord gateway is ready',
    );
  }
}

