import { defineConfig, devices } from '@playwright/test';

const safeTestDatabaseUrl = (() => {
  const value = process.env.TEST_DATABASE_URL;
  if (value !== undefined) {
    try {
      const parsed = new URL(value);
      const databaseName = parsed.pathname.replace(/^\/+/, '').toLowerCase();
      if (
        ['127.0.0.1', '::1', 'localhost'].includes(parsed.hostname.toLowerCase()) &&
        /(?:^|[_-])test(?:$|[_-])/.test(databaseName)
      ) {
        return value;
      }
    } catch {
      // Fall through to the non-routable local test default.
    }
  }
  return 'postgresql://sufbot:sufbot_test_password@127.0.0.1:5433/sufbot_test';
})();

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI === 'true' ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm --filter @sufbot/web dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: process.env.CI !== 'true',
    timeout: 120_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: safeTestDatabaseUrl,
      REDIS_URL: process.env.REDIS_URL ?? 'redis://:sufbot_dev_password@127.0.0.1:6379/0',
      DISCORD_CLIENT_ID: '123456789012345678',
      DISCORD_CLIENT_SECRET: 'test-discord-client-secret-at-least-32-characters',
      AUTH_SECRET: 'test-auth-secret-at-least-thirty-two-characters',
      AUTH_TRUST_HOST: 'true',
      INTERNAL_API_SECRET: 'test-internal-secret-at-least-thirty-two-characters',
      ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
      SESSION_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
      BOT_OWNER_DISCORD_IDS: '123456789012345678',
      BOT_DEVELOPER_DISCORD_IDS: '',
      PLATFORM_ADMIN_DISCORD_IDS: '',
    },
  },
});
