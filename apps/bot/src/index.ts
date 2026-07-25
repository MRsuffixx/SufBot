import { container, Events as SapphireEvents, SapphireClient } from '@sapphire/framework';
import {
  Events,
  GatewayIntentBits,
  MessageFlags,
  Partials,
  type ChatInputCommandInteraction,
  type ClientOptions,
  type ContextMenuCommandInteraction,
} from 'discord.js';
import { loadAppConfig, loadBotEnvironment } from '@sufbot/config';
import { DistributedCache } from '@sufbot/cache';
import { disconnectPrisma, getPrismaClient } from '@sufbot/database';
import { createLogger } from '@sufbot/logger';
import { createId } from '@sufbot/shared';
import { BotServices } from './services.js';

const env = loadBotEnvironment();
const config = loadAppConfig();
const logger = createLogger(
  { app: 'bot', environment: env.NODE_ENV, version: '0.1.0' },
  {
    level: config.logging.level,
    pretty: env.NODE_ENV === 'development' && config.logging.prettyDevelopmentLogs,
  },
);
const prisma = getPrismaClient(env.DATABASE_URL);
const cache = new DistributedCache(env.REDIS_URL, {
  namespace: config.cache.namespace,
  localTtlSeconds: config.cache.localTtlSeconds,
  redisTtlSeconds: config.cache.guildConfigTtlSeconds,
  invalidationChannel: config.cache.invalidationChannel,
  logger,
});
await cache.connect();
container.sufbot = new BotServices(env, prisma, cache, logger, config);

const intentMap = {
  Guilds: GatewayIntentBits.Guilds,
  GuildMembers: GatewayIntentBits.GuildMembers,
} as const;
const partialMap = {
  GuildMember: Partials.GuildMember,
  User: Partials.User,
} as const;
const clientOptions: ClientOptions = {
  intents: config.discord.intents.flatMap((intent) =>
    intent in intentMap ? [intentMap[intent as keyof typeof intentMap]] : [],
  ),
  partials: config.discord.partials.flatMap((partial) =>
    partial in partialMap ? [partialMap[partial as keyof typeof partialMap]] : [],
  ),
  allowedMentions: { parse: [], repliedUser: false },
  failIfNotExists: false,
  ...(config.discord.sharding.enabled ? { shards: 'auto' as const } : {}),
};
const client = new SapphireClient(clientOptions);
const startedInteractions = new Map<string, number>();

client.on(SapphireEvents.ChatInputCommandRun, (interaction) => {
  startedInteractions.set(interaction.id, performance.now());
});
client.on(SapphireEvents.ChatInputCommandFinish, (interaction, command) => {
  const startedAt = startedInteractions.get(interaction.id) ?? performance.now();
  startedInteractions.delete(interaction.id);
  void prisma.commandUsage.create({
    data: {
      guildId: interaction.guildId,
      discordUserId: interaction.user.id,
      commandName: command.name,
      correlationId: interaction.id,
      success: true,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      shardId: interaction.guild?.shardId ?? null,
    },
  }).catch((error: unknown) => logger.warn({ err: error }, 'command usage logging failed'));
});
client.on(SapphireEvents.ChatInputCommandDenied, (error, { interaction }) => {
  logger.warn(
    { code: error.identifier, userId: interaction.user.id, guildId: interaction.guildId },
    'command authorization denied',
  );
  const response = { content: error.message, flags: MessageFlags.Ephemeral as const };
  void (interaction.deferred || interaction.replied
    ? interaction.followUp(response)
    : interaction.reply(response));
});
client.on(SapphireEvents.ContextMenuCommandDenied, (error, { interaction }) => {
  const response = { content: error.message, flags: MessageFlags.Ephemeral as const };
  void (interaction.deferred || interaction.replied
    ? interaction.followUp(response)
    : interaction.reply(response));
});

const handleInteractionError = async (
  error: unknown,
  interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction,
): Promise<void> => {
  const reference = createId('err');
  logger.error(
    {
      err: error,
      errorReference: reference,
      interactionId: interaction.id,
      guildId: interaction.guildId,
      userId: interaction.user.id,
    },
    'Discord interaction failed',
  );
  if (!interaction.isRepliable()) return;
  const response = {
    content: `Something went wrong. Reference: ${reference}`,
    flags: MessageFlags.Ephemeral as const,
  };
  if (interaction.deferred || interaction.replied) await interaction.followUp(response);
  else await interaction.reply(response);
};

client.on(SapphireEvents.ChatInputCommandError, (error, { interaction }) => {
  void handleInteractionError(error, interaction);
});
client.on(SapphireEvents.ContextMenuCommandError, (error, { interaction }) => {
  void handleInteractionError(error, interaction);
});
client.on(Events.Error, (error) => logger.error({ err: error }, 'Discord client error'));
client.on(Events.Warn, (warning) => logger.warn({ warning }, 'Discord client warning'));

const stopInvalidation = await cache.subscribe((event) => {
  logger.debug({ guildId: event.guildId, module: event.module }, 'configuration invalidated');
});

let stopping = false;
const shutdown = async (signal: string): Promise<void> => {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'bot graceful shutdown started');
  const forceExit = setTimeout(() => process.exit(1), 20_000);
  forceExit.unref();
  client.destroy();
  await stopInvalidation();
  await cache.close();
  await disconnectPrisma();
  clearTimeout(forceExit);
  logger.info('bot graceful shutdown completed');
};
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (error) => {
  logger.fatal({ err: error }, 'unhandled rejection');
  void shutdown('unhandledRejection').then(() => process.exit(1));
});

const loginWithRetry = async (): Promise<void> => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await client.login(env.DISCORD_BOT_TOKEN);
      return;
    } catch (error) {
      lastError = error;
      logger.error({ err: error, attempt }, 'Discord login failed');
      await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** attempt, 15_000)));
    }
  }
  throw lastError;
};

await loginWithRetry();
