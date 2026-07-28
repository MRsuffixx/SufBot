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
import {
  canonicalDiscordApplicationId,
  loadAppConfig,
  loadBotEnvironment,
  resolveDiscordDevelopmentGuildIds,
} from '@sufbot/config';
import { DistributedCache, ServiceHeartbeat } from '@sufbot/cache';
import { disconnectPrisma, getPrismaClient } from '@sufbot/database';
import { createRuntimeLogger } from '@sufbot/logger/runtime';
import { createId } from '@sufbot/shared';
import { BotServices } from './services.js';
import { GuildStatusService } from './guild-status.js';
import { CommandRegistrationManager } from './command-registration.js';

const env = loadBotEnvironment();
const config = loadAppConfig();
const logger = await createRuntimeLogger(
  { app: 'bot', environment: env.NODE_ENV, version: '0.1.0' },
  {
    level: config.logging.level,
    pretty: env.NODE_ENV === 'development' && config.logging.prettyDevelopmentLogs,
  },
);
const prisma = getPrismaClient(env.DATABASE_URL);
const cache = new DistributedCache(env.REDIS_URL, {
  namespace: `${config.cache.namespace}:${env.NODE_ENV}`,
  localTtlSeconds: config.cache.localTtlSeconds,
  redisTtlSeconds: config.cache.guildConfigTtlSeconds,
  invalidationChannel: config.cache.invalidationChannel,
  logger,
});
const heartbeat = new ServiceHeartbeat(env.REDIS_URL, {
  namespace: `${config.cache.namespace}:${env.NODE_ENV}`,
  service: 'bot',
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
const runtimeServices: { guildStatus?: GuildStatusService } = {};
const startedInteractions = new Map<string, number>();

client.on(SapphireEvents.ChatInputCommandRun, (interaction) => {
  startedInteractions.set(interaction.id, performance.now());
});
client.on(SapphireEvents.ChatInputCommandFinish, (interaction, command) => {
  const startedAt = startedInteractions.get(interaction.id) ?? performance.now();
  startedInteractions.delete(interaction.id);
  void prisma.commandUsage
    .create({
      data: {
        guildId: interaction.guildId,
        discordUserId: interaction.user.id,
        commandName: command.name,
        correlationId: interaction.id,
        success: true,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
        shardId: interaction.guild?.shardId ?? null,
      },
    })
    .catch((error: unknown) => logger.warn({ err: error }, 'command usage logging failed'));
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
  logger.debug(
    {
      guildId: event.guildId,
      invalidationType: event.type,
      ...(event.type === 'guild.config.updated' && event.module !== undefined
        ? { module: event.module }
        : {}),
      ...(event.type === 'guild.entitlements.updated' && event.subscriptionId !== undefined
        ? { subscriptionId: event.subscriptionId }
        : {}),
    },
    'guild cache invalidated',
  );
});

let stopping = false;
const shutdown = async (signal: string): Promise<void> => {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'bot graceful shutdown started');
  const forceExit = setTimeout(() => process.exit(1), 20_000);
  forceExit.unref();
  client.destroy();
  if (runtimeServices.guildStatus !== undefined) await runtimeServices.guildStatus.close();
  await heartbeat.close();
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
      if (!client.isReady()) {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            client.off(Events.ClientReady, onReady);
            reject(new TypeError('Discord gateway did not become ready within 30 seconds.'));
          }, 30_000);
          const onReady = (): void => {
            clearTimeout(timeout);
            resolve();
          };
          client.once(Events.ClientReady, onReady);
        });
      }
      return;
    } catch (error) {
      lastError = error;
      logger.error({ err: error, attempt }, 'Discord login failed');
      client.destroy();
      await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** attempt, 15_000)));
    }
  }
  throw lastError;
};

await loginWithRetry();
if (!client.isReady()) throw new TypeError('Discord client did not become ready after login.');
const applicationId = canonicalDiscordApplicationId(env);
const developmentGuildIds = resolveDiscordDevelopmentGuildIds(
  env,
  config.discord.developmentGuildIds,
);
const commandRegistration = new CommandRegistrationManager(
  env.DISCORD_BOT_TOKEN,
  applicationId,
  logger,
);
commandRegistration.validateClientApplication(client);
if (!config.discord.enableSlashCommands) {
  container.sufbot.setCommandRegistrationStatus({
    status: 'disabled',
    mode: 'disabled',
    discoveredCount: 0,
    registeredCount: 0,
    commandNames: [],
  });
} else if (env.NODE_ENV === 'development') {
  container.sufbot.setCommandRegistrationStatus(
    await commandRegistration.deployGuilds(developmentGuildIds),
  );
} else {
  const status = await commandRegistration.status('global');
  container.sufbot.setCommandRegistrationStatus(status);
  logger.info(
    {
      applicationId,
      mode: 'global',
      status: status.status,
      registeredCount: status.registeredCount,
      schemaHash: status.schemaHash,
    },
    'Production startup inspected global commands without redeploying',
  );
}
const guildStatus = new GuildStatusService(client, container.sufbot);
runtimeServices.guildStatus = guildStatus;
container.sufbot.guildStatus = guildStatus;
await guildStatus.start();
await heartbeat.start();
logger.info('SufBot bot is ready');
