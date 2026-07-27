import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger } from '@sufbot/logger';
import { createRuntimeLogger } from '@sufbot/logger/runtime';

describe('structured logger redaction', () => {
  it('redacts database URLs, tokens, and encryption keys', () => {
    let output = '';
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });
    const logger = createLogger(
      { app: 'test', environment: 'test' },
      { level: 'info', destination },
    );
    const databaseUrl = 'postgresql://sufbot:never-log-database-password@localhost:5432/sufbot';
    const token = 'never-log-discord-token';
    const key = 'never-log-session-encryption-key';

    logger.info(
      {
        DATABASE_URL: databaseUrl,
        nested: { accessToken: token },
        SESSION_ENCRYPTION_KEY: key,
      },
      'redaction check',
    );

    expect(output).not.toContain(databaseUrl);
    expect(output).not.toContain(token);
    expect(output).not.toContain(key);
    expect(output).toContain('[REDACTED]');
  });

  it('creates local pretty output without a Pino transport worker', async () => {
    const logger = await createRuntimeLogger(
      { app: 'test', environment: 'development' },
      { level: 'silent', pretty: true },
    );

    expect(typeof logger.info).toBe('function');
  });
});
