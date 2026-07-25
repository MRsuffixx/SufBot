import { Command } from '@sapphire/framework';
import type { CommandMetadata } from '@sufbot/discord';

export abstract class SufBotCommand extends Command {
  public readonly metadata: CommandMetadata;

  protected constructor(context: Command.LoaderContext, metadata: CommandMetadata) {
    super(context, {
      name: metadata.name,
      description: metadata.description,
      preconditions: ['Authorized'],
    });
    this.metadata = metadata;
  }
}

