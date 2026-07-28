import type { PrismaClient } from '@sufbot/database/generated';
import { AuthorizationError, RateLimitError } from '@sufbot/shared';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export class BillingRiskService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async assertCheckoutAllowed(input: {
    userId: string;
    guildId: string;
    requestId: string;
    now?: Date;
  }): Promise<void> {
    const now = input.now ?? new Date();
    const [blocks, userCheckouts, guildCheckouts, failedPayments, disputes] = await Promise.all([
      this.prisma.billingRiskBlock.findFirst({
        where: {
          status: 'ACTIVE',
          OR: [
            { targetType: 'USER', targetId: input.userId },
            { targetType: 'GUILD', targetId: input.guildId },
          ],
          AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
        },
        select: { id: true },
      }),
      this.prisma.checkoutSession.count({
        where: {
          userId: input.userId,
          createdAt: { gt: new Date(now.getTime() - HOUR_MS) },
        },
      }),
      this.prisma.checkoutSession.count({
        where: {
          guildId: input.guildId,
          createdAt: { gt: new Date(now.getTime() - HOUR_MS) },
        },
      }),
      this.prisma.paymentTransaction.count({
        where: {
          purchaserUserId: input.userId,
          status: 'FAILED',
          createdAt: { gt: new Date(now.getTime() - 7 * DAY_MS) },
        },
      }),
      this.prisma.paymentTransaction.count({
        where: {
          purchaserUserId: input.userId,
          status: 'DISPUTED',
          createdAt: { gt: new Date(now.getTime() - 180 * DAY_MS) },
        },
      }),
    ]);
    if (blocks !== null) {
      await this.#audit(input, 'staff-block');
      throw new AuthorizationError(
        'Checkout is unavailable for this account or guild. Contact support with the request reference.',
        'BILLING_CHECKOUT_UNAVAILABLE',
      );
    }
    const signal =
      userCheckouts >= 8
        ? 'user-checkout-volume'
        : guildCheckouts >= 5
          ? 'guild-checkout-volume'
          : failedPayments >= 10
            ? 'repeated-payment-failure'
            : disputes >= 2
              ? 'dispute-review-cooldown'
              : undefined;
    if (signal !== undefined) {
      await this.#audit(input, signal);
      throw new RateLimitError(
        'Billing checkout is temporarily unavailable. Contact support with the request reference.',
      );
    }
  }

  async #audit(
    input: { userId: string; guildId: string; requestId: string },
    signal: string,
  ): Promise<void> {
    await this.prisma.billingAuditEvent.create({
      data: {
        actorType: 'SYSTEM',
        actorUserId: input.userId,
        guildId: input.guildId,
        action: 'billing.risk.checkout-blocked',
        requestId: input.requestId,
        source: 'risk',
        metadata: { signal },
      },
    });
  }
}
