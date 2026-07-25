import { container, type Command } from '@sapphire/framework';

export const registrationOptions = (): Command.RegistryOptions => {
  const { discord } = container.sufbot.config;
  const guildIds = discord.registerCommandsGlobally ? undefined : discord.developmentGuildIds;
  return {
    ...(guildIds === undefined ? {} : { guildIds }),
    registerCommandIfMissing:
      discord.registerCommandsGlobally || discord.developmentGuildIds.length > 0,
  };
};

