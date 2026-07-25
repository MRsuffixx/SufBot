import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ApiEnvironmentSchema,
  AppConfigSchema,
  WebEnvironmentSchema,
} from '@sufbot/config';

const validCommonEnvironment = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://sufbot:test@localhost:5432/sufbot_test',
  REDIS_URL: 'redis://localhost:6379/1',
};

describe('configuration validation', () => {
  it('accepts the committed application configuration', () => {
    const raw = JSON.parse(
      readFileSync(resolve(process.cwd(), 'config.json'), 'utf8'),
    ) as unknown;
    expect(AppConfigSchema.safeParse(raw).success).toBe(true);
  });

  it('rejects short internal secrets and non-PostgreSQL database URLs', () => {
    const parsed = ApiEnvironmentSchema.safeParse({
      ...validCommonEnvironment,
      DATABASE_URL: 'sqlite://local.db',
      INTERNAL_API_SECRET: 'short',
      WEBHOOK_SIGNING_SECRET: 'short',
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts a complete web environment and decodes encryption keys', () => {
    const parsed = WebEnvironmentSchema.safeParse({
      ...validCommonEnvironment,
      DISCORD_CLIENT_ID: '123456789012345678',
      DISCORD_CLIENT_SECRET: 'd'.repeat(32),
      AUTH_SECRET: 'a'.repeat(32),
      AUTH_TRUST_HOST: 'true',
      INTERNAL_API_SECRET: 'i'.repeat(32),
      ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
      SESSION_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString('base64'),
      BOT_OWNER_DISCORD_IDS: '123456789012345678',
      BOT_DEVELOPER_DISCORD_IDS: '',
      PLATFORM_ADMIN_DISCORD_IDS: '',
    });
    expect(parsed.success).toBe(true);
  });
});
