import { ApplicationCommandRegistry, container } from '@sapphire/framework';

export const registrationOptions = (): ApplicationCommandRegistry.RegisterOptions => {
  const { discord } = container.sufbot.config;
  const guildIds = discord.registerCommandsGlobally ? undefined : discord.developmentGuildIds;
  return {
    ...(guildIds === undefined ? {} : { guildIds }),
    registerCommandIfMissing:
      discord.registerCommandsGlobally || discord.developmentGuildIds.length > 0,
  };
};
