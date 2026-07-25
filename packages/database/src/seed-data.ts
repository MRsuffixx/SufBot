import type { PrismaClient } from './generated/prisma/client.js';

const featureFlags = [
  { key: 'module:general', enabled: true },
  { key: 'module:moderation', enabled: true },
  { key: 'module:logging', enabled: false },
  { key: 'module:welcome', enabled: false },
  { key: 'module:automod', enabled: false },
] as const;

const moduleDefinitions = [
  { key: 'general', enabledByDefault: true },
  { key: 'moderation', enabledByDefault: false },
  { key: 'logging', enabledByDefault: false },
  { key: 'welcome', enabledByDefault: false },
  { key: 'automod', enabledByDefault: false },
] as const;

const locales = [
  { code: 'en', name: 'English', isDefault: true },
  { code: 'tr', name: 'Türkçe', isDefault: false },
] as const;

export const seedDatabase = async (prisma: PrismaClient): Promise<void> => {
  await prisma.$transaction([
    ...featureFlags.map(({ key, enabled }) =>
      prisma.featureFlag.upsert({
        where: { key_scopeKey: { key, scopeKey: 'platform' } },
        create: { key, scopeKey: 'platform', enabled },
        update: { enabled },
      }),
    ),
    ...moduleDefinitions.map(({ key, enabledByDefault }) =>
      prisma.moduleDefinition.upsert({
        where: { key },
        create: { key, enabledByDefault, available: true },
        update: { enabledByDefault, available: true },
      }),
    ),
    ...locales.map(({ code, name, isDefault }) =>
      prisma.localeDefinition.upsert({
        where: { code },
        create: { code, name, enabled: true, isDefault },
        update: { name, enabled: true, isDefault },
      }),
    ),
    prisma.platformConfiguration.upsert({
      where: { key: 'defaults' },
      create: {
        key: 'defaults',
        value: { locale: 'en', timezone: 'UTC', commandPrefix: '!' },
      },
      update: {
        value: { locale: 'en', timezone: 'UTC', commandPrefix: '!' },
      },
    }),
  ]);
};
