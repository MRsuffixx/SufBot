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
          me: {
            roles: {
              highest: { comparePositionTo: () => 1 },
            },
          },
          fetch: (id: string) =>
            Promise.resolve(
              id === '123456789012345678'
                ? {
                    id,
                    roles: {
                      highest: { comparePositionTo: () => 1 },
                    },
                  }
                : {
              id: '423456789012345678',
              moderatable: true,
                    roles: {
                      highest: {},
                    },
              timeout,
                  },
            ),
        },
      },
      options: {
        getUser: () => ({ id: '423456789012345678', bot: false }),
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

    expect(timeout).toHaveBeenCalledWith(15 * 60_000, expect.stringContaining('Repeated spam'));
    expect(deferReply).toHaveBeenCalledOnce();
    expect(auditCreate).toHaveBeenCalledOnce();
    expect(editReply).toHaveBeenCalledWith(expect.stringContaining('<@423456789012345678>'));
  });

  it('rejects a target with an equal or higher role than the moderator', async () => {
    const reply = vi.fn(() => Promise.resolve());
    const timeout = vi.fn(() => Promise.resolve());
    const targetRole = {};
    const interaction = {
      id: 'interaction-2',
      user: { id: '123456789012345678' },
      guild: {
        id: '223456789012345678',
        ownerId: '323456789012345678',
        members: {
          me: { roles: { highest: { comparePositionTo: () => 1 } } },
          fetch: (id: string) =>
            Promise.resolve(
              id === '123456789012345678'
                ? { id, roles: { highest: { comparePositionTo: () => 0 } } }
                : {
                    id,
                    moderatable: true,
                    roles: { highest: targetRole },
                    timeout,
                  },
            ),
        },
      },
      options: {
        getUser: () => ({ id: '423456789012345678', bot: false }),
        getInteger: () => 15,
        getString: () => 'Reason',
      },
      reply,
    } as unknown as ChatInputCommandInteraction;

    await TimeoutCommand.prototype.chatInputRun.call({} as TimeoutCommand, interaction);

    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringMatching(/role hierarchy/i) }),
    );
    expect(timeout).not.toHaveBeenCalled();
  });

  it('rejects self-targeting before fetching a guild member', async () => {
    const reply = vi.fn(() => Promise.resolve());
    const fetch = vi.fn();
    const interaction = {
      user: { id: '123456789012345678' },
      guild: {
        ownerId: '323456789012345678',
        members: { fetch },
      },
      options: {
        getUser: () => ({ id: '123456789012345678', bot: false }),
        getInteger: () => 15,
        getString: () => null,
      },
      reply,
    } as unknown as ChatInputCommandInteraction;

    await TimeoutCommand.prototype.chatInputRun.call({} as TimeoutCommand, interaction);

    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringMatching(/yourself/i) }),
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
