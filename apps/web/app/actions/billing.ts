'use server';

import { cookies, headers } from 'next/headers';
import { isIP } from 'node:net';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  BillingCheckoutService,
  BillingManagementService,
  CancellationRequestSchema,
  CheckoutRequestSchema,
  ResumeRequestSchema,
} from '@sufbot/billing';
import { createId, isAppError } from '@sufbot/shared';
import { requireBotInGuild } from '@sufbot/auth';
import { requireDashboardSession } from '@/lib/session';
import { requireLiveGuildAccess } from '@/lib/discord';
import {
  appConfig,
  billingProviders,
  cache,
  ensureCacheConnection,
  prisma,
  webEnvironment,
} from '@/lib/runtime';
import { validateMutationOrigin } from '@/lib/server-security';
import { billingCheckoutCookies } from '@/lib/billing-cookies';
import type { ActionState } from './guild';

const GuildIdSchema = z.string().regex(/^\d{17,20}$/);
const MutationIdSchema = z.string().regex(/^mut_[a-f0-9]{32}$/);
const checkoutService = () =>
  new BillingCheckoutService(
    prisma,
    appConfig,
    billingProviders,
    webEnvironment.NODE_ENV,
  );
const managementService = () =>
  new BillingManagementService(prisma, appConfig, billingProviders, cache);

const claimMutation = async (formData: FormData, scope: string): Promise<string> => {
  const idempotencyKey = MutationIdSchema.parse(formData.get('idempotencyKey'));
  await ensureCacheConnection();
  const claimed = await cache.claimOnce(scope, idempotencyKey, 600);
  if (!claimed) throw new Error('Duplicate billing mutation rejected.');
  return idempotencyKey;
};

const requestId = async (): Promise<string> => {
  const requestHeaders = await headers();
  const incoming = requestHeaders.get('x-request-id');
  return incoming !== null && /^[A-Za-z0-9_-]{8,128}$/.test(incoming)
    ? incoming
    : createId('req');
};

const safeAction = async (operation: () => Promise<string>): Promise<ActionState> => {
  try {
    return { status: 'success', message: await operation() };
  } catch (error) {
    return {
      status: 'error',
      message:
        isAppError(error) && error.expose && error.message.length <= 180
          ? error.message
          : 'The billing request could not be completed. Refresh and try again.',
    };
  }
};

export const createBillingCheckoutAction = async (formData: FormData): Promise<void> => {
  await validateMutationOrigin();
  await claimMutation(formData, 'billing-checkout');
  const session = await requireDashboardSession();
  const guildId = GuildIdSchema.parse(formData.get('guildId'));
  await requireLiveGuildAccess(session.user.id, guildId);
  await requireBotInGuild(prisma, guildId);
  const input = CheckoutRequestSchema.parse({
    provider: formData.get('provider'),
    planCode: formData.get('planCode'),
    confirmationAccepted: formData.get('confirmationAccepted') === 'true',
    ...(formData.get('billingEmail') === null
      ? {}
      : {
          billingContact: {
            email: formData.get('billingEmail'),
            fullName: formData.get('billingFullName'),
            address: formData.get('billingAddress'),
            phone: formData.get('billingPhone'),
          },
        }),
  });
  const paytrCustomer =
    input.provider === 'PAYTR' && input.billingContact !== undefined
      ? {
          ...input.billingContact,
          userIp: await trustedRequestIp(),
        }
      : undefined;
  const result = await checkoutService().createCheckout({
    userId: session.user.id,
    guildId,
    provider: input.provider,
    planCode: input.planCode,
    successUrl: `${appConfig.application.websiteUrl}/premium/status`,
    cancelUrl: `${appConfig.application.websiteUrl}/dashboard/guilds/${guildId}/premium?checkout=cancelled`,
    requestId: await requestId(),
    ...(paytrCustomer === undefined ? {} : { paytrCustomer }),
  });
  if (result.kind === 'unavailable') {
    redirect(
      `/dashboard/guilds/${guildId}/premium?${new URLSearchParams({
        error: result.code,
      })}`,
    );
  }
  const cookieStore = await cookies();
  const cookieOptions = {
    httpOnly: true,
    secure: webEnvironment.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: appConfig.billing.checkoutSessionTtlMinutes * 60,
  };
  cookieStore.set(billingCheckoutCookies.session, result.checkoutSessionId, cookieOptions);
  cookieStore.set(billingCheckoutCookies.status, result.statusToken, cookieOptions);
  redirect(
    result.kind === 'redirect'
      ? result.url
      : `${appConfig.application.websiteUrl}/premium/paytr`,
  );
};

const trustedRequestIp = async (): Promise<string> => {
  const requestHeaders = await headers();
  const candidates = [
    requestHeaders.get('x-real-ip'),
    requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim(),
  ];
  const address = candidates.find(
    (candidate): candidate is string => candidate !== null && isIP(candidate) !== 0,
  );
  if (address === undefined) {
    throw new Error('A validated client IP is required for PayTR.');
  }
  return address;
};

export const cancelBillingAction = async (
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> =>
  safeAction(async () => {
    await validateMutationOrigin();
    const idempotencyKey = await claimMutation(formData, 'billing-cancel');
    const session = await requireDashboardSession();
    const guildId = GuildIdSchema.parse(formData.get('guildId'));
    await requireLiveGuildAccess(session.user.id, guildId);
    const input = CancellationRequestSchema.parse({
      subscriptionId: formData.get('subscriptionId'),
      expectedVersion: Number(formData.get('expectedVersion')),
      idempotencyKey,
    });
    const result = await managementService().cancelAtPeriodEnd({
      guildId,
      userId: session.user.id,
      ...input,
      requestId: await requestId(),
    });
    revalidatePath(`/dashboard/guilds/${guildId}/premium`);
    return `Cancellation is scheduled for ${result.currentPeriodEnd ?? 'the verified period end'}.`;
  });

export const resumeBillingAction = async (
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> =>
  safeAction(async () => {
    await validateMutationOrigin();
    const idempotencyKey = await claimMutation(formData, 'billing-resume');
    const session = await requireDashboardSession();
    const guildId = GuildIdSchema.parse(formData.get('guildId'));
    await requireLiveGuildAccess(session.user.id, guildId);
    const input = ResumeRequestSchema.parse({
      subscriptionId: formData.get('subscriptionId'),
      expectedVersion: Number(formData.get('expectedVersion')),
      idempotencyKey,
    });
    await managementService().resume({
      guildId,
      userId: session.user.id,
      ...input,
      requestId: await requestId(),
    });
    revalidatePath(`/dashboard/guilds/${guildId}/premium`);
    return 'Automatic renewal was resumed after provider reconciliation.';
  });

export const openBillingPortalAction = async (formData: FormData): Promise<void> => {
  await validateMutationOrigin();
  await claimMutation(formData, 'billing-portal');
  const session = await requireDashboardSession();
  const guildId = GuildIdSchema.parse(formData.get('guildId'));
  const subscriptionId = z.uuid().parse(formData.get('subscriptionId'));
  await requireLiveGuildAccess(session.user.id, guildId);
  const portal = await managementService().createManagementSession({
    guildId,
    userId: session.user.id,
    subscriptionId,
    returnUrl: `${appConfig.application.websiteUrl}/dashboard/guilds/${guildId}/premium`,
  });
  redirect(portal.url);
};
