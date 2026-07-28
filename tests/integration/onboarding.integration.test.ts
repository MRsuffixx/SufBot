import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OnboardingEventJournal, OnboardingRepository } from '@sufbot/onboarding';
import { createPrismaClient, type PrismaClient } from '@sufbot/database';
import { getSafeLocalTestDatabaseUrl } from './environment.js';

const databaseUrl = getSafeLocalTestDatabaseUrl();
const run = databaseUrl === undefined ? describe.skip : describe;

run('onboarding PostgreSQL invariants', () => {
  let prisma: PrismaClient;
  let userId: string;
  const ownerDiscordId = '982000000000000001';
  const guildA = '982000000000000010';
  const guildB = '982000000000000011';

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl as string);
    const user = await prisma.user.upsert({
      where: { discordId: ownerDiscordId },
      create: { discordId: ownerDiscordId, displayName: 'Onboarding integration user' },
      update: { deletedAt: null },
    });
    userId = user.id;
    await prisma.guild.createMany({
      data: [
        { id: guildA, name: 'Onboarding A', ownerDiscordId, botInstalled: true },
        { id: guildB, name: 'Onboarding B', ownerDiscordId, botInstalled: true },
      ],
      skipDuplicates: true,
    });
  });

  beforeEach(async () => {
    await prisma.onboardingEvent.deleteMany({ where: { guildId: { in: [guildA, guildB] } } });
    await prisma.memberVerification.deleteMany({ where: { guildId: { in: [guildA, guildB] } } });
    await prisma.guildAuditLog.deleteMany({ where: { guildId: { in: [guildA, guildB] } } });
    await prisma.guildOnboardingConfig.deleteMany({
      where: { guildId: { in: [guildA, guildB] } },
    });
  });

  afterAll(async () => {
    await prisma.onboardingEvent.deleteMany({ where: { guildId: { in: [guildA, guildB] } } });
    await prisma.memberVerification.deleteMany({ where: { guildId: { in: [guildA, guildB] } } });
    await prisma.guildAuditLog.deleteMany({ where: { guildId: { in: [guildA, guildB] } } });
    await prisma.guildOnboardingConfig.deleteMany({
      where: { guildId: { in: [guildA, guildB] } },
    });
    await prisma.guild.deleteMany({ where: { id: { in: [guildA, guildB] } } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('keeps guild configuration isolated and audits a versioned update atomically', async () => {
    const repository = new OnboardingRepository(prisma);
    const [initialA, initialB] = await Promise.all([
      repository.get(guildA),
      repository.get(guildB),
    ]);
    const updated = await repository.updateBasics(
      {
        welcomeEnabled: true,
        goodbyeEnabled: false,
        verificationEnabled: true,
        autoRoleEnabled: false,
        welcomeCardEnabled: false,
        expectedVersion: initialA.version,
      },
      guildA,
      {
        actorUserId: userId,
        actorDiscordId: ownerDiscordId,
        requestId: 'onboarding-integration-update',
        source: 'dashboard',
      },
    );
    expect(updated.version).toBe(initialA.version + 1);
    expect(updated.welcomeEnabled).toBe(true);
    await expect(repository.get(guildB)).resolves.toMatchObject({
      version: initialB.version,
      welcomeEnabled: false,
      verificationEnabled: false,
    });
    await expect(
      prisma.guildAuditLog.count({
        where: {
          guildId: guildA,
          requestId: 'onboarding-integration-update',
          action: 'onboarding.basics.updated',
        },
      }),
    ).resolves.toBe(1);
  });

  it('allows only one concurrent optimistic update for the same version', async () => {
    const repository = new OnboardingRepository(prisma);
    const initial = await repository.get(guildA);
    const input = {
      welcomeEnabled: true,
      goodbyeEnabled: false,
      verificationEnabled: false,
      autoRoleEnabled: false,
      welcomeCardEnabled: false,
      expectedVersion: initial.version,
    };
    const attempts = await Promise.allSettled([
      repository.updateBasics(input, guildA, {
        actorUserId: userId,
        actorDiscordId: ownerDiscordId,
        requestId: 'onboarding-concurrent-a',
        source: 'api',
      }),
      repository.updateBasics(input, guildA, {
        actorUserId: userId,
        actorDiscordId: ownerDiscordId,
        requestId: 'onboarding-concurrent-b',
        source: 'api',
      }),
    ]);
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
  });

  it('deduplicates gateway side effects through event idempotency keys', async () => {
    const journal = new OnboardingEventJournal(prisma);
    const event = {
      guildId: guildA,
      userId: '982000000000000020',
      eventType: 'member.joined',
      idempotencyKey: 'onboarding-member-joined-982000000000000020',
      correlationId: 'onboarding-event-integration',
    };
    const attempts = await Promise.all([
      journal.claim(event),
      journal.claim(event),
    ]);
    expect(attempts.filter(Boolean)).toHaveLength(1);
    await journal.complete({ idempotencyKey: event.idempotencyKey });
    await expect(journal.claim(event)).resolves.toBe(false);
    await expect(
      prisma.onboardingEvent.findUniqueOrThrow({
        where: { idempotencyKey: event.idempotencyKey },
        select: { status: true, attemptCount: true },
      }),
    ).resolves.toEqual({ status: 'SUCCEEDED', attemptCount: 1 });
  });
});
