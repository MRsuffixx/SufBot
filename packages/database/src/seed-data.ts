import type { PrismaClient } from './generated/prisma/client.js';

const featureFlags = [
  { key: 'module:general', enabled: true },
  { key: 'module:moderation', enabled: true },
  { key: 'module:logging', enabled: false },
  { key: 'module:welcome', enabled: false },
  { key: 'module:onboarding', enabled: true },
  { key: 'module:automod', enabled: false },
] as const;

const moduleDefinitions = [
  { key: 'general', enabledByDefault: true },
  { key: 'moderation', enabledByDefault: false },
  { key: 'logging', enabledByDefault: false },
  { key: 'welcome', enabledByDefault: false },
  { key: 'onboarding', enabledByDefault: false },
  { key: 'automod', enabledByDefault: false },
] as const;

const locales = [
  { code: 'en', name: 'English', isDefault: true },
  { code: 'tr', name: 'Türkçe', isDefault: false },
] as const;

export const seedDatabase = async (prisma: PrismaClient): Promise<void> => {
  await prisma.$transaction(
    async (transaction) => {
      for (const { key, enabled } of featureFlags) {
        await transaction.featureFlag.upsert({
          where: { key_scopeKey: { key, scopeKey: 'platform' } },
          create: { key, scopeKey: 'platform', enabled },
          update: { enabled },
        });
      }
      for (const { key, enabledByDefault } of moduleDefinitions) {
        await transaction.moduleDefinition.upsert({
          where: { key },
          create: { key, enabledByDefault, available: true },
          update: { enabledByDefault, available: true },
        });
      }
      for (const { code, name, isDefault } of locales) {
        await transaction.localeDefinition.upsert({
          where: { code },
          create: { code, name, enabled: true, isDefault },
          update: { name, enabled: true, isDefault },
        });
      }
      await transaction.platformConfiguration.upsert({
        where: { key: 'defaults' },
        create: {
          key: 'defaults',
          value: { locale: 'en', timezone: 'UTC', commandPrefix: '!' },
        },
        update: {
          value: { locale: 'en', timezone: 'UTC', commandPrefix: '!' },
        },
      });
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
};
