import { describe, expect, it } from 'vitest';
import { commandMetadata } from '@sufbot/discord';
import {
  applicationCommandDefinitions,
  validateApplicationCommands,
} from '../../apps/bot/src/application-commands.js';

describe('application command discovery', () => {
  it('discovers unique definitions with stable metadata', () => {
    const result = validateApplicationCommands();
    expect(result.commands).toHaveLength(applicationCommandDefinitions.length);
    expect(result.schemaHash).toMatch(/^[a-f0-9]{64}$/);
    const keys = result.commands.map((command) => `${command.type ?? 1}:${command.name}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('includes every executable chat command in shared metadata', () => {
    const commandNames = validateApplicationCommands()
      .commands.filter((command) => command.type === undefined || command.type === 1)
      .map((command) => command.name);
    expect(commandNames.sort()).toEqual([...commandMetadata.keys()].sort());
  });

  it('contains the foundational commands', () => {
    const names = validateApplicationCommands().commandNames;
    expect(names).toEqual(expect.arrayContaining(['ping', 'help', 'dashboard', 'diagnostics']));
  });
});
