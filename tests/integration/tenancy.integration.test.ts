import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { requireGuildAccess } from '@sufbot/auth';
import {
  GuildRepository,
  createPrismaClient,
  type PrismaClient,
} from '@sufbot/database';
import { DiscordPermission } from '@sufbot/permissions';

const databaseUrl = process.env.TEST_DATABASE_URL;
const run = databaseUrl === undefined ? describe.skip : describe;

run('PostgreSQL tenant isolation', () => {
  let prisma: PrismaClient;
  const userDiscordId = '980000000000000001';
  const ownerDiscordId = '980000000000000002';
  const guildA = '980000000000000010';
  const guildB = '980000000000000011';

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl as string);
    await prisma.guild.createMany({
      data: [
        {
          id: guildA,
          name: 'Integration A',
          ownerDiscordId,
          botInstalled: true,
        },
        {
          id: guildB,
          name: 'Integration B',
          ownerDiscordId,
          botInstalled: true,
        },
      ],
      skipDuplicates: true,
    });
    const user = await prisma.user.upsert({
      where: { discordId: userDiscordId },
      create: { discordId: userDiscordId, displayName: 'Integration user' },
      update: { deletedAt: null },
    });
    await prisma.guildAccessGrant.upsert({
      where: { userId_guildId: { userId: user.id, guildId: guildA } },
      create: {
        userId: user.id,
        guildId: guildA,
        permissionBitfield: DiscordPermission.ManageGuild.toString(),
        verifiedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      },
      update: {
        permissionBitfield: DiscordPermission.ManageGuild.toString(),
        verifiedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
  });

  afterAll(async () => {
    const user = await prisma.user.findUnique({
      where: { discordId: userDiscordId },
      select: { id: true },
    });
    if (user !== null) await prisma.user.delete({ where: { id: user.id } });
    await prisma.guild.deleteMany({ where: { id: { in: [guildA, guildB] } } });
    await prisma.$disconnect();
  });

  it('authorizes only the guild represented by the fresh grant', async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { discordId: userDiscordId },
    });
    await expect(
      requireGuildAccess(prisma, user.id, guildA),
    ).resolves.toMatchObject({ guildId: guildA });
    await expect(requireGuildAccess(prisma, user.id, guildB)).rejects.toMatchObject({
      code: 'GUILD_ACCESS_STALE',
    });
  });

  it('writes settings and its audit record in one transaction', async () => {
    const repository = new GuildRepository(prisma);
    const updated = await repository.updateSettings(
      guildA,
      {
        locale: 'tr',
        timezone: 'Europe/Istanbul',
        commandPrefix: '?',
        expectedVersion: 1,
      },
      {
        discordUserId: userDiscordId,
        requestId: 'integration-settings-1',
      },
    );
    expect(updated).toMatchObject({ locale: 'tr', version: 2 });
    await expect(
      repository.updateSettings(
        guildA,
        { locale: 'en', expectedVersion: 1 },
        {
          discordUserId: userDiscordId,
          requestId: 'integration-settings-stale',
        },
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      prisma.guildAuditLog.count({
        where: { guildId: guildA, requestId: 'integration-settings-1' },
      }),
    ).resolves.toBe(1);
  });
});
