import type { Prisma, PrismaClient } from '@sufbot/database/generated';

export type ClaimOnboardingEventInput = {
  guildId: string;
  userId?: string;
  eventType: string;
  idempotencyKey: string;
  correlationId: string;
  occurredAt?: Date;
  details?: Prisma.InputJsonValue;
};

export type CompleteOnboardingEventInput = {
  idempotencyKey: string;
  status?: 'SUCCEEDED' | 'SKIPPED';
  details?: Prisma.InputJsonValue;
};

export type FailOnboardingEventInput = {
  idempotencyKey: string;
  errorCode: string;
  failureReason: string;
  details?: Prisma.InputJsonValue;
};

export class OnboardingEventJournal {
  public constructor(private readonly prisma: PrismaClient) {}

  public async claim(input: ClaimOnboardingEventInput, staleAfterMs = 120_000): Promise<boolean> {
    const now = new Date();
    await this.prisma.onboardingEvent.createMany({
      data: [
        {
          guildId: input.guildId,
          ...(input.userId === undefined ? {} : { userId: input.userId }),
          eventType: input.eventType,
          idempotencyKey: input.idempotencyKey,
          correlationId: input.correlationId,
          ...(input.occurredAt === undefined ? {} : { occurredAt: input.occurredAt }),
          ...(input.details === undefined ? {} : { details: input.details }),
        },
      ],
      skipDuplicates: true,
    });
    const claimed = await this.prisma.onboardingEvent.updateMany({
      where: {
        idempotencyKey: input.idempotencyKey,
        OR: [
          { status: { in: ['PENDING', 'FAILED'] } },
          { status: 'PROCESSING', updatedAt: { lte: new Date(now.getTime() - staleAfterMs) } },
        ],
      },
      data: {
        status: 'PROCESSING',
        attemptCount: { increment: 1 },
        correlationId: input.correlationId,
        errorCode: null,
        failureReason: null,
      },
    });
    return claimed.count === 1;
  }

  public async complete(input: CompleteOnboardingEventInput): Promise<void> {
    await this.prisma.onboardingEvent.update({
      where: { idempotencyKey: input.idempotencyKey },
      data: {
        status: input.status ?? 'SUCCEEDED',
        processedAt: new Date(),
        errorCode: null,
        failureReason: null,
        ...(input.details === undefined ? {} : { details: input.details }),
      },
    });
  }

  public async fail(input: FailOnboardingEventInput): Promise<void> {
    await this.prisma.onboardingEvent.update({
      where: { idempotencyKey: input.idempotencyKey },
      data: {
        status: 'FAILED',
        errorCode: input.errorCode.slice(0, 64),
        failureReason: input.failureReason.slice(0, 255),
        ...(input.details === undefined ? {} : { details: input.details }),
      },
    });
  }
}
