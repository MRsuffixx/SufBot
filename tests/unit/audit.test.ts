import { describe, expect, it } from 'vitest';
import { sanitizeAuditValue } from '@sufbot/database';

describe('audit redaction', () => {
  it('redacts nested credentials while preserving useful context', () => {
    expect(
      sanitizeAuditValue({
        action: 'oauth.refresh',
        accessToken: 'never-log-this',
        nested: {
          password: 'never-log-this-either',
          guildId: '123456789012345678',
        },
      }),
    ).toEqual({
      action: 'oauth.refresh',
      accessToken: '[REDACTED]',
      nested: {
        password: '[REDACTED]',
        guildId: '123456789012345678',
      },
    });
  });

  it('bounds recursive audit structures', () => {
    let value: Record<string, unknown> = {};
    for (let index = 0; index < 12; index += 1) {
      value = { nested: value };
    }
    expect(JSON.stringify(sanitizeAuditValue(value))).toContain('[MAX_DEPTH]');
  });
});
