import {
  REST,
  Routes,
  type Client,
  type RESTGetAPIApplicationCommandsResult,
  type RESTPostAPIApplicationCommandsJSONBody,
} from 'discord.js';
import type { Logger } from '@sufbot/logger';
import { CommandRegistrationStatusSchema, type CommandRegistrationStatus } from '@sufbot/discord';
import { validateApplicationCommands } from './application-commands.js';

export type CommandRegistrationMode = 'development-guild' | 'global';

const errorCode = (error: unknown): string => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (typeof error.code === 'string' || typeof error.code === 'number')
  ) {
    return String(error.code).slice(0, 64);
  }
  return 'DISCORD_REST_FAILURE';
};

const commandNames = (commands: RESTGetAPIApplicationCommandsResult): string[] =>
  commands.map((command) => command.name);

export class CommandRegistrationManager {
  readonly #rest: REST;

  public constructor(
    token: string,
    public readonly applicationId: string,
    private readonly logger: Logger,
  ) {
    this.#rest = new REST({ version: '10' }).setToken(token);
  }

  public validateClientApplication(client: Client<true>): void {
    if (client.user.id !== this.applicationId || client.application.id !== this.applicationId) {
      throw new TypeError(
        `Configured Discord application ${this.applicationId} does not match the authenticated bot application.`,
      );
    }
  }

  public validate(): ReturnType<typeof validateApplicationCommands> {
    return validateApplicationCommands();
  }

  public async deployGuilds(guildIds: readonly string[]): Promise<CommandRegistrationStatus> {
    if (guildIds.length === 0) {
      throw new TypeError(
        'No development guild IDs are configured. Set DISCORD_DEVELOPMENT_GUILD_IDS.',
      );
    }
    const validated = this.validate();
    this.logger.info(
      {
        applicationId: this.applicationId,
        mode: 'development-guild',
        guildIds,
        commandCount: validated.commands.length,
        commandNames: validated.commandNames,
        schemaHash: validated.schemaHash,
      },
      'SufBot command registration started',
    );

    try {
      const counts = await Promise.all(
        guildIds.map(async (guildId) => {
          const response = (await this.#rest.put(
            Routes.applicationGuildCommands(this.applicationId, guildId),
            { body: validated.commands },
          )) as RESTGetAPIApplicationCommandsResult;
          this.logger.info(
            {
              applicationId: this.applicationId,
              guildId,
              responseStatus: 'confirmed',
              registeredCount: response.length,
              registeredCommandNames: commandNames(response),
            },
            'Discord confirmed guild command registration',
          );
          return response.length;
        }),
      );
      const registeredCount = counts.length === 0 ? 0 : Math.min(...counts);
      return CommandRegistrationStatusSchema.parse({
        status: 'success',
        mode: 'development-guild',
        discoveredCount: validated.commands.length,
        registeredCount,
        commandNames: validated.commandNames,
        schemaHash: validated.schemaHash,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      const code = errorCode(error);
      this.logger.error(
        {
          err: error,
          applicationId: this.applicationId,
          mode: 'development-guild',
          guildIds,
          errorCode: code,
        },
        'Discord guild command registration failed',
      );
      throw error;
    }
  }

  public async deployGlobal(): Promise<CommandRegistrationStatus> {
    const validated = this.validate();
    this.logger.info(
      {
        applicationId: this.applicationId,
        mode: 'global',
        commandCount: validated.commands.length,
        commandNames: validated.commandNames,
        schemaHash: validated.schemaHash,
      },
      'SufBot global command deployment started',
    );
    const response = (await this.#rest.put(Routes.applicationCommands(this.applicationId), {
      body: validated.commands,
    })) as RESTGetAPIApplicationCommandsResult;
    this.logger.info(
      {
        applicationId: this.applicationId,
        responseStatus: 'confirmed',
        registeredCount: response.length,
        registeredCommandNames: commandNames(response),
      },
      'Discord confirmed global command deployment',
    );
    return CommandRegistrationStatusSchema.parse({
      status: 'success',
      mode: 'global',
      discoveredCount: validated.commands.length,
      registeredCount: response.length,
      commandNames: validated.commandNames,
      schemaHash: validated.schemaHash,
      updatedAt: new Date().toISOString(),
    });
  }

  public async status(
    mode: CommandRegistrationMode,
    guildIds: readonly string[] = [],
  ): Promise<CommandRegistrationStatus> {
    const validated = this.validate();
    const responses =
      mode === 'global'
        ? [
            (await this.#rest.get(
              Routes.applicationCommands(this.applicationId),
            )) as RESTGetAPIApplicationCommandsResult,
          ]
        : await Promise.all(
            guildIds.map(
              async (guildId) =>
                (await this.#rest.get(
                  Routes.applicationGuildCommands(this.applicationId, guildId),
                )) as RESTGetAPIApplicationCommandsResult,
            ),
          );
    const registeredCount =
      responses.length === 0 ? 0 : Math.min(...responses.map((response) => response.length));
    const allMatch =
      responses.length > 0 &&
      responses.every(
        (response) =>
          response.length === validated.commands.length &&
          validated.commandNames.every((name) => response.some((command) => command.name === name)),
      );
    return CommandRegistrationStatusSchema.parse({
      status: allMatch ? 'success' : 'failure',
      mode,
      discoveredCount: validated.commands.length,
      registeredCount,
      commandNames: validated.commandNames,
      schemaHash: validated.schemaHash,
      updatedAt: new Date().toISOString(),
      ...(allMatch ? {} : { errorCode: 'COMMAND_SCHEMA_MISMATCH' }),
    });
  }

  public async clearGuilds(guildIds: readonly string[]): Promise<void> {
    if (guildIds.length === 0) throw new TypeError('No development guild IDs are configured.');
    const empty: RESTPostAPIApplicationCommandsJSONBody[] = [];
    await Promise.all(
      guildIds.map((guildId) =>
        this.#rest.put(Routes.applicationGuildCommands(this.applicationId, guildId), {
          body: empty,
        }),
      ),
    );
  }
}
