import { describe, expect, it, vi } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';
import { TimeoutCommand } from '../../apps/bot/src/commands/timeout.js';

describe('timeout Discord interaction', () => {
  it('uses the validated options, Discord hierarchy check, and audit boundary', async () => {
    const timeout = vi.fn(() => Promise.resolve());
    const auditCreate = vi.fn(() => Promise.resolve({ id: 'audit-1' }));
    const deferReply = vi.fn(() => Promise.resolve());
    const editReply = vi.fn(() => Promise.resolve());
    const interaction = {
      id: 'interaction-1',
      user: { id: '123456789012345678' },
      guild: {
        id: '223456789012345678',
        ownerId: '323456789012345678',
        members: {
          fetch: () =>
            Promise.resolve({
              id: '423456789012345678',
              moderatable: true,
              timeout,
            }),
        },
      },
      options: {
        getUser: () => ({ id: '423456789012345678' }),
        getInteger: () => 15,
        getString: () => 'Repeated spam',
      },
      deferReply,
      editReply,
    } as unknown as ChatInputCommandInteraction;
    const command = {
      container: {
        sufbot: {
          prisma: { guildAuditLog: { create: auditCreate } },
          localeForGuild: () => Promise.resolve('en'),
        },
      },
    } as unknown as TimeoutCommand;

    await TimeoutCommand.prototype.chatInputRun.call(command, interaction);

    expect(timeout).toHaveBeenCalledWith(
      15 * 60_000,
      expect.stringContaining('Repeated spam'),
    );
    expect(deferReply).toHaveBeenCalledOnce();
    expect(auditCreate).toHaveBeenCalledOnce();
    expect(editReply).toHaveBeenCalledWith(
      expect.stringContaining('<@423456789012345678>'),
    );
  });
});
