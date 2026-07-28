import { ConflictError } from '@sufbot/shared';
import {
  SubscriptionStatusSchema,
  type SubscriptionStatus,
} from './contracts.js';

const allowedTransitions: Readonly<
  Record<SubscriptionStatus, ReadonlySet<SubscriptionStatus>>
> = {
  PENDING: new Set(['INCOMPLETE', 'ACTIVE', 'CANCELLED', 'EXPIRED']),
  INCOMPLETE: new Set(['ACTIVE', 'EXPIRED', 'CANCELLED']),
  ACTIVE: new Set([
    'PAST_DUE',
    'GRACE_PERIOD',
    'SUSPENDED',
    'CANCELLED',
    'DISPUTED',
    'REFUNDED',
    'EXPIRED',
  ]),
  PAST_DUE: new Set(['ACTIVE', 'GRACE_PERIOD', 'SUSPENDED', 'CANCELLED', 'DISPUTED']),
  GRACE_PERIOD: new Set(['ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED', 'DISPUTED']),
  SUSPENDED: new Set(['ACTIVE', 'CANCELLED', 'EXPIRED', 'DISPUTED', 'REFUNDED']),
  CANCELLED: new Set(['ACTIVE', 'EXPIRED', 'REFUNDED']),
  EXPIRED: new Set<SubscriptionStatus>(),
  DISPUTED: new Set(['ACTIVE', 'SUSPENDED', 'CANCELLED', 'REFUNDED']),
  REFUNDED: new Set<SubscriptionStatus>(),
};

export const canTransitionSubscription = (
  current: SubscriptionStatus,
  next: SubscriptionStatus,
): boolean => {
  const parsedCurrent = SubscriptionStatusSchema.parse(current);
  const parsedNext = SubscriptionStatusSchema.parse(next);
  return parsedCurrent === parsedNext || allowedTransitions[parsedCurrent].has(parsedNext);
};

export const assertSubscriptionTransition = (
  current: SubscriptionStatus,
  next: SubscriptionStatus,
): void => {
  if (!canTransitionSubscription(current, next)) {
    throw new ConflictError(`Subscription cannot transition from ${current} to ${next}.`);
  }
};

export const subscriptionGrantsPremium = (
  subscription: {
    status: SubscriptionStatus;
    currentPeriodEnd: Date | null;
    gracePeriodEndsAt: Date | null;
    latestPaymentStatus:
      | 'PENDING'
      | 'SUCCEEDED'
      | 'FAILED'
      | 'REFUNDED'
      | 'PARTIALLY_REFUNDED'
      | 'DISPUTED'
      | 'REVERSED'
      | 'UNKNOWN';
  },
  at = new Date(),
): { grants: boolean; endsAt: Date | null } => {
  if (
    (subscription.status === 'ACTIVE' || subscription.status === 'CANCELLED') &&
    subscription.latestPaymentStatus === 'SUCCEEDED' &&
    subscription.currentPeriodEnd !== null &&
    subscription.currentPeriodEnd > at
  ) {
    return { grants: true, endsAt: subscription.currentPeriodEnd };
  }
  if (
    subscription.status === 'GRACE_PERIOD' &&
    subscription.gracePeriodEndsAt !== null &&
    subscription.gracePeriodEndsAt > at
  ) {
    return { grants: true, endsAt: subscription.gracePeriodEndsAt };
  }
  return { grants: false, endsAt: null };
};
