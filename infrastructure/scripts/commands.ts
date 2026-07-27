import {
  canonicalDiscordApplicationId,
  loadAppConfig,
  loadBotEnvironment,
  resolveDiscordDevelopmentGuildIds,
} from '@sufbot/config';
import { commandMetadata } from '@sufbot/discord';
import { createRuntimeLogger } from '@sufbot/logger/runtime';
import { validateApplicationCommands } from '../../apps/bot/src/application-commands.js';
import { CommandRegistrationManager } from '../../apps/bot/src/command-registration.js';

const action = process.argv[2];
const validated = validateApplicationCommands();

if (action === 'validate') {
  process.stdout.write(
    `Commands valid: ${validated.commands.length}\nSchema: ${validated.schemaHash}\n`,
  );
  process.exit(0);
}

if (action === 'list') {
  for (const command of validated.commands) {
    const metadata = commandMetadata.get(command.name);
    const permissions =
      metadata?.requiredUserPermissions.map((permission) => permission.toString()).join(', ') ??
      'none';
    process.stdout.write(
      `${command.name}\t${metadata?.category ?? 'Context menu'}\tuser permissions: ${permissions || 'none'}\n`,
    );
  }
  process.stdout.write(`Total: ${validated.commands.length}\n`);
  process.exit(0);
}

const supportedActions = new Set(['deploy:guild', 'deploy:global', 'clear:guild', 'status']);
if (action === undefined || !supportedActions.has(action)) {
  process.stderr.write(
    'Usage: commands.ts validate|list|deploy:guild|deploy:global|clear:guild|status\n',
  );
  process.exit(1);
}

const environment = loadBotEnvironment();
const config = loadAppConfig();
const applicationId = canonicalDiscordApplicationId(environment);
const guildIds = resolveDiscordDevelopmentGuildIds(environment, config.discord.developmentGuildIds);
const logger = await createRuntimeLogger(
  { app: 'bot', environment: environment.NODE_ENV, version: '0.1.0' },
  { level: config.logging.level, pretty: environment.NODE_ENV === 'development' },
);
const manager = new CommandRegistrationManager(
  environment.DISCORD_BOT_TOKEN,
  applicationId,
  logger,
);

if (action === 'deploy:guild') {
  const status = await manager.deployGuilds(guildIds);
  process.stdout.write(
    `Application: ${applicationId}\nMode: development guild registration\nGuilds: ${guildIds.length}\nCommands discovered: ${status.discoveredCount}\nCommands registered: ${status.registeredCount}\nStatus: ${status.status}\n`,
  );
} else if (action === 'deploy:global') {
  const status = await manager.deployGlobal();
  process.stdout.write(
    `Application: ${applicationId}\nMode: global deployment\nCommands discovered: ${status.discoveredCount}\nCommands registered: ${status.registeredCount}\nStatus: ${status.status}\n`,
  );
} else if (action === 'clear:guild') {
  if (!process.argv.includes('--confirm')) {
    throw new TypeError(
      'Clearing guild commands is destructive. Re-run commands:clear:guild with --confirm.',
    );
  }
  await manager.clearGuilds(guildIds);
  process.stdout.write(`Cleared commands from ${guildIds.length} development guild(s).\n`);
} else {
  const mode = environment.NODE_ENV === 'development' ? 'development-guild' : 'global';
  const status = await manager.status(mode, guildIds);
  process.stdout.write(
    `Application: ${applicationId}\nMode: ${mode}\nCommands discovered: ${status.discoveredCount}\nCommands registered: ${status.registeredCount}\nStatus: ${status.status}\n`,
  );
  if (status.status !== 'success') process.exitCode = 1;
}
