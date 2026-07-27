import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  SlashCommandBuilder,
  type RESTPostAPIApplicationCommandsJSONBody,
} from 'discord.js';
import { commandMetadata } from '@sufbot/discord';
import { sha256 } from '@sufbot/shared';

export type ApplicationCommandDefinition = {
  executionName: string;
  build: () => {
    toJSON(): RESTPostAPIApplicationCommandsJSONBody;
  };
};

const simpleCommand = (name: string): ApplicationCommandDefinition => ({
  executionName: name,
  build: () => {
    const metadata = commandMetadata.get(name);
    if (metadata === undefined) throw new TypeError(`Command metadata is missing for ${name}.`);
    return new SlashCommandBuilder().setName(name).setDescription(metadata.description);
  },
});

export const applicationCommandDefinitions: readonly ApplicationCommandDefinition[] = [
  {
    executionName: 'admin',
    build: () =>
      new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Run platform administrative actions.')
        .addSubcommand((subcommand) =>
          subcommand.setName('reload-config').setDescription('Reload validated config.json.'),
        ),
  },
  simpleCommand('botinfo'),
  {
    executionName: 'config',
    build: () =>
      new SlashCommandBuilder()
        .setName('config')
        .setDescription('View or update server configuration.')
        .addSubcommand((subcommand) =>
          subcommand.setName('view').setDescription('View server configuration.'),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('set-language')
            .setDescription('Set the server language.')
            .addStringOption((option) =>
              option
                .setName('language')
                .setDescription('English or Turkish')
                .setRequired(true)
                .setAutocomplete(true),
            ),
        ),
  },
  simpleCommand('dashboard'),
  simpleCommand('diagnostics'),
  simpleCommand('help'),
  simpleCommand('ping'),
  simpleCommand('serverinfo'),
  simpleCommand('settings'),
  {
    executionName: 'timeout',
    build: () =>
      new SlashCommandBuilder()
        .setName('timeout')
        .setDescription('Temporarily prevent a member from interacting.')
        .addUserOption((option) =>
          option.setName('member').setDescription('Member to timeout').setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName('minutes')
            .setDescription('Timeout duration in minutes')
            .setMinValue(1)
            .setMaxValue(40_320)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('reason')
            .setDescription('Audit reason')
            .setMaxLength(300)
            .setRequired(false),
        ),
  },
  {
    executionName: 'userinfo',
    build: () =>
      new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('Show user information.')
        .addUserOption((option) =>
          option.setName('user').setDescription('User to inspect').setRequired(false),
        ),
  },
  {
    executionName: 'userinfo',
    build: () =>
      new ContextMenuCommandBuilder()
        .setName('User information')
        .setType(ApplicationCommandType.User),
  },
];

export const applicationCommandData = (): RESTPostAPIApplicationCommandsJSONBody[] =>
  applicationCommandDefinitions.map((definition) => definition.build().toJSON());

export type CommandValidationResult = {
  commands: RESTPostAPIApplicationCommandsJSONBody[];
  commandNames: string[];
  schemaHash: string;
};

export const validateApplicationCommands = (): CommandValidationResult => {
  const commands = applicationCommandData();
  if (commands.length === 0) throw new TypeError('No application commands were discovered.');
  if (commands.length > 100)
    throw new TypeError('Discord allows at most 100 application commands.');

  const keys = new Set<string>();
  for (const command of commands) {
    const key = `${command.type ?? ApplicationCommandType.ChatInput}:${command.name}`;
    if (keys.has(key)) throw new TypeError(`Duplicate application command: ${key}.`);
    keys.add(key);
    if (command.type === undefined || command.type === ApplicationCommandType.ChatInput) {
      if (!commandMetadata.has(command.name)) {
        throw new TypeError(`Application command metadata is missing for ${command.name}.`);
      }
    }
  }

  const commandNames = commands.map((command) => command.name);
  const schemaHash = sha256(JSON.stringify(commands));
  return { commands, commandNames, schemaHash };
};
