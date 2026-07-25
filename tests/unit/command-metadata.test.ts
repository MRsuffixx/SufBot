import { describe, expect, it } from 'vitest';
import { builtInModules, commandMetadata, requireCommandMetadata } from '@sufbot/discord';

describe('command metadata registry', () => {
  it('contains unique command names with safe cooldowns', () => {
    const commands = builtInModules.flatMap((module) => module.commands);
    expect(commandMetadata.size).toBe(commands.length);
    expect(commands.every((command) => command.cooldownSeconds > 0)).toBe(true);
  });

  it('keeps moderation authorization requirements declarative', () => {
    expect(requireCommandMetadata('timeout')).toMatchObject({
      guildOnly: true,
      requiredModule: 'moderation',
    });
    expect(() => requireCommandMetadata('unknown')).toThrowError(/metadata is missing/);
  });
});
