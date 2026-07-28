import { createId } from '@sufbot/shared';
import { z } from 'zod';
import { ActionForm } from '@/components/action-form';
import { Card } from '@/components/ui/card';
import {
  adminAddPromotionAction,
  adminReconcileBillingAction,
  adminRevokePromotionAction,
} from '@/app/actions/billing-admin';
import { requireBillingAdmin } from '@/lib/billing-admin';
import { billingProviders, prisma } from '@/lib/runtime';

export const dynamic = 'force-dynamic';

const SearchSchema = z.object({
  query: z.string().trim().max(100).optional(),
  provider: z.enum(['STRIPE', 'PAYTR']).optional(),
  status: z
    .enum([
      'PENDING',
      'INCOMPLETE',
      'ACTIVE',
      'PAST_DUE',
      'GRACE_PERIOD',
      'SUSPENDED',
      'CANCELLED',
      'EXPIRED',
      'DISPUTED',
      'REFUNDED',
    ])
    .optional(),
});

export default async function BillingAdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireBillingAdmin();
  const raw = await searchParams;
  const search = SearchSchema.parse({
    ...(typeof raw.query === 'string' && raw.query !== '' ? { query: raw.query } : {}),
    ...(typeof raw.provider === 'string' && raw.provider !== ''
      ? { provider: raw.provider }
      : {}),
    ...(typeof raw.status === 'string' && raw.status !== ''
      ? { status: raw.status }
      : {}),
  });
  const [subscriptions, failedEvents, promotions, capabilities] = await Promise.all([
    prisma.guildSubscription.findMany({
      where: {
        ...(search.provider === undefined ? {} : { provider: search.provider }),
        ...(search.status === undefined ? {} : { status: search.status }),
        ...(search.query === undefined
          ? {}
          : {
              OR: [
                { id: { contains: search.query, mode: 'insensitive' } },
                { guildId: { contains: search.query } },
                { providerSubscriptionId: { contains: search.query } },
                { purchaser: { displayName: { contains: search.query, mode: 'insensitive' } } },
              ],
            }),
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: {
        guild: { select: { name: true } },
        purchaser: { select: { displayName: true } },
      },
    }),
    prisma.billingProviderEvent.findMany({
      where: { processingStatus: { in: ['FAILED', 'DEAD_LETTERED'] } },
      orderBy: { receivedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        provider: true,
        eventType: true,
        failureCode: true,
        receivedAt: true,
        correlationId: true,
      },
    }),
    prisma.guildEntitlement.findMany({
      where: { source: 'MANUAL_PROMOTION', status: 'ACTIVE' },
      distinct: ['guildId', 'sourceReference'],
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { guildId: true, sourceReference: true, endsAt: true },
    }),
    Promise.all(
      [...billingProviders.values()].map((provider) => provider.checkCapabilities()),
    ),
  ]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <p className="text-sm font-bold uppercase tracking-[.18em] text-red-500">
          Platform billing administration
        </p>
        <h1 className="mt-2 text-3xl font-black">Verified financial state only</h1>
        <p className="mt-2 text-[var(--muted)]">
          This interface cannot mark a payment as paid. Mutations require confirmation,
          reason, idempotency, and an immutable billing role.
        </p>
      </div>

      <Card>
        <h2 className="font-bold">Provider capability health</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {capabilities.map((capability) => (
            <div key={capability.provider} className="rounded-xl border p-4 text-sm">
              <div className="flex justify-between">
                <strong>{capability.provider}</strong>
                <span>{capability.ready ? 'Ready' : 'Unavailable'}</span>
              </div>
              <p className="mt-2 text-[var(--muted)]">
                Recurring: {capability.recurring ? 'verified' : 'not verified'} · Card
                storage: {capability.cardStorage ? 'verified' : 'not verified'}
              </p>
              {capability.reasonCodes.length > 0 ? (
                <p className="mt-2 text-xs text-amber-500">
                  {capability.reasonCodes.join(', ')}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="font-bold">Search subscriptions</h2>
        <form className="mt-4 flex flex-wrap gap-3" method="get">
          <input
            name="query"
            defaultValue={search.query}
            placeholder="Guild, user, subscription"
            className="rounded-xl border bg-transparent px-3 py-2"
          />
          <select name="provider" defaultValue={search.provider ?? ''} className="rounded-xl border bg-transparent px-3 py-2">
            <option value="">All providers</option>
            <option value="STRIPE">Stripe</option>
            <option value="PAYTR">PayTR</option>
          </select>
          <input
            name="status"
            defaultValue={search.status}
            placeholder="Status"
            className="rounded-xl border bg-transparent px-3 py-2"
          />
          <button className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white">
            Filter
          </button>
        </form>
        <div className="mt-5 space-y-4">
          {subscriptions.map((subscription) => (
            <div key={subscription.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <p className="font-semibold">{subscription.guild.name}</p>
                  <p className="text-sm text-[var(--muted)]">
                    {subscription.provider} · {subscription.status} · owner{' '}
                    {subscription.purchaser.displayName}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Internal {maskIdentifier(subscription.id)} · Provider{' '}
                    {maskIdentifier(subscription.providerSubscriptionId)}
                  </p>
                </div>
                {subscription.providerSubscriptionId !== null ? (
                  <ActionForm
                    action={adminReconcileBillingAction}
                    submitLabel="Reconcile provider"
                    className="space-y-2"
                  >
                    <input type="hidden" name="subscriptionId" value={subscription.id} />
                    <input type="hidden" name="idempotencyKey" value={createId('mut')} />
                    <input
                      required
                      minLength={10}
                      maxLength={500}
                      name="reason"
                      placeholder="Operational reason"
                      className="rounded-xl border bg-transparent px-3 py-2 text-sm"
                    />
                    <input
                      required
                      name="confirmation"
                      placeholder="Type CONFIRM"
                      className="rounded-xl border bg-transparent px-3 py-2 text-sm"
                    />
                  </ActionForm>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="font-bold">Grant manual promotion</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Promotions are separate from paid subscriptions and require an expiry.
          </p>
          <ActionForm
            action={adminAddPromotionAction}
            submitLabel="Grant promotion"
            className="mt-4 grid gap-3"
          >
            <input type="hidden" name="idempotencyKey" value={createId('mut')} />
            <input required name="guildId" placeholder="Guild ID" className="rounded-xl border bg-transparent px-3 py-2" />
            <input required type="datetime-local" name="endsAt" className="rounded-xl border bg-transparent px-3 py-2" />
            <input required minLength={10} maxLength={500} name="reason" placeholder="Reason" className="rounded-xl border bg-transparent px-3 py-2" />
            <input required name="confirmation" placeholder="Type CONFIRM" className="rounded-xl border bg-transparent px-3 py-2" />
          </ActionForm>
        </Card>
        <Card>
          <h2 className="font-bold">Active manual promotions</h2>
          <div className="mt-4 space-y-4">
            {promotions.map((promotion) => (
              <ActionForm
                key={`${promotion.guildId}:${promotion.sourceReference}`}
                action={adminRevokePromotionAction}
                submitLabel="Revoke promotion"
                className="rounded-xl border p-3"
              >
                <p className="text-sm">
                  Guild {promotion.guildId} · ends {promotion.endsAt?.toLocaleString() ?? '—'}
                </p>
                <input type="hidden" name="guildId" value={promotion.guildId} />
                <input type="hidden" name="sourceReference" value={promotion.sourceReference} />
                <input type="hidden" name="idempotencyKey" value={createId('mut')} />
                <input required minLength={10} maxLength={500} name="reason" placeholder="Revocation reason" className="my-2 rounded-xl border bg-transparent px-3 py-2" />
                <input required name="confirmation" placeholder="Type CONFIRM" className="mb-2 rounded-xl border bg-transparent px-3 py-2" />
              </ActionForm>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="font-bold">Failed provider events</h2>
        <div className="mt-4 space-y-3 text-sm">
          {failedEvents.length === 0 ? (
            <p className="text-[var(--muted)]">No failed provider events.</p>
          ) : (
            failedEvents.map((event) => (
              <div key={event.id}>
                {event.provider} · {event.eventType} · {event.failureCode ?? 'UNKNOWN'} ·{' '}
                {event.receivedAt.toLocaleString()} · ref {event.correlationId}
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

function maskIdentifier(value: string | null): string {
  if (value === null) return '—';
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-6)}`;
}
