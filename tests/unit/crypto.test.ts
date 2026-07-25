import { describe, expect, it } from 'vitest';
import { constantTimeEqual, decryptString, encryptString } from '@sufbot/shared';
import { signInternalRequest, verifyInternalRequest, type ReplayStore } from '@sufbot/auth';

const encryptionKey = Buffer.alloc(32, 7).toString('base64');

describe('cryptographic boundaries', () => {
  it('round-trips AES-256-GCM envelopes and rejects tampering', () => {
    const encrypted = encryptString('discord-refresh-token', encryptionKey);
    expect(encrypted).not.toContain('discord-refresh-token');
    expect(decryptString(encrypted, encryptionKey)).toBe('discord-refresh-token');

    const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith('A') ? 'B' : 'A'}`;
    expect(() => decryptString(tampered, encryptionKey)).toThrow();
  });

  it('performs equality checks without accepting different lengths', () => {
    expect(constantTimeEqual('same', 'same')).toBe(true);
    expect(constantTimeEqual('same', 'different')).toBe(false);
  });

  it('verifies a fresh signed request once and rejects replay', async () => {
    const claimed = new Set<string>();
    const replayStore: ReplayStore = {
      claim: (nonce) => Promise.resolve(!claimed.has(nonce) && Boolean(claimed.add(nonce))),
    };
    const secret = 'x'.repeat(32);
    const timestamp = '2026-07-25T10:00:00.000Z';
    const nonce = 'nonce_1234567890abcdef';
    const signature = signInternalRequest(
      secret,
      'POST',
      '/v1/internal/cache/invalidate',
      '{"guildId":"123"}',
      timestamp,
      nonce,
    );
    const verify = () =>
      verifyInternalRequest(
        secret,
        'POST',
        '/v1/internal/cache/invalidate',
        '{"guildId":"123"}',
        { timestamp, nonce, signature },
        replayStore,
        { now: new Date(timestamp), maxAgeSeconds: 60 },
      );

    await expect(verify()).resolves.toBeUndefined();
    await expect(verify()).rejects.toMatchObject({
      code: 'INTERNAL_REPLAY_REJECTED',
    });
  });
});
