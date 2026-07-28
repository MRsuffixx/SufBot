import { createId } from '@sufbot/shared';
import {
  BillingManagementService,
  CurrencyCodeSchema,
  configuredPlan,
  formatConfiguredPrice,
} from '@sufbot/billing';
import { ActionForm } from '@/components/action-form';
import { BillingCheckoutForm } from '@/components/billing-checkout-form';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  cancelBillingAction,
  openBillingPortalAction,
  resumeBillingAction,
} from '@/app/actions/billing';
import { requireDashboardSession } from '@/lib/session';
import { appConfig, billingProviders, cache, prisma } from '@/lib/runtime';

export const dynamic = 'force-dynamic';

export default async function GuildPremiumPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ error?: string; checkout?: string }>;
}) {
  const session = await requireDashboardSession();
  const { guildId } = await params;
  const query = await searchParams;
  const plan = configuredPlan(appConfig);
  const management = new BillingManagementService(
    prisma,
    appConfig,
    billingProviders,
    cache,
  );
  const [guild, status, payments, auditEvents, capabilities, notifications] = await Promise.all([
    prisma.guild.findUniqueOrThrow({
      where: { id: guildId },
      select: { name: true, iconHash: true },
    }),
    management.getGuildBillingStatus(guildId),
    management.listPayments(guildId, 20),
    management.listAuditEvents(guildId, 20),
    Promise.all(
      [...billingProviders.values()].map((provider) => provider.checkCapabilities()),
    ),
    prisma.billingNotification.findMany({
      where: { guildId, userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, title: true, message: true, createdAt: true },
    }),
  ]);
  const purchaser =
    status.purchaserUserId === null
      ? null
      : await prisma.user.findUnique({
          where: { id: status.purchaserUserId },
          select: { displayName: true },
        });
  const isBillingOwner = status.purchaserUserId === session.user.id;
  const stripe = capabilities.find((capability) => capability.provider === 'STRIPE');
  const paytr = capabilities.find((capability) => capability.provider === 'PAYTR');
  const lastSuccessful = payments.find((payment) => payment.status === 'SUCCEEDED');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[.18em] text-violet-600">
            Premium billing
          </p>
          <h2 className="mt-2 text-3xl font-black tracking-tight">{guild.name}</h2>
          <p className="mt-2 text-[var(--muted)]">
            {plan.displayName} · {formatConfiguredPrice(plan.amountMinor, plan.currency)} /
            month
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1.5 text-sm font-bold ${
            status.premiumActive
              ? 'bg-emerald-500/10 text-emerald-500'
              : 'bg-slate-500/10 text-slate-500'
          }`}
        >
          {status.premiumActive ? 'Premium active' : 'Premium inactive'}
        </span>
      </div>

      {query.checkout === 'cancelled' ? (
        <Card className="border-amber-500/40">
          Checkout was cancelled. Premium was not activated.
        </Card>
      ) : null}
      {query.error !== undefined ? (
        <Card className="border-red-500/40">
          Provider checkout is unavailable. Reference: {query.error.slice(0, 100)}
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h3 className="text-lg font-bold">Subscription</h3>
          <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
            <BillingFact label="Status" value={status.status?.toLowerCase() ?? 'Not subscribed'} />
            <BillingFact label="Provider" value={status.provider ?? '—'} />
            <BillingFact
              label="Renewal / end date"
              value={formatDate(status.currentPeriodEnd)}
            />
            <BillingFact
              label="Grace period ends"
              value={formatDate(status.gracePeriodEndsAt)}
            />
            <BillingFact
              label="Cancellation"
              value={status.cancelAtPeriodEnd ? 'Scheduled at period end' : 'Not scheduled'}
            />
            <BillingFact
              label="Billing owner"
              value={purchaser?.displayName ?? '—'}
            />
            <BillingFact
              label="Last successful payment"
              value={lastSuccessful?.paidAt?.toLocaleString() ?? '—'}
            />
            <BillingFact
              label="Next expected payment"
              value={
                status.cancelAtPeriodEnd ? 'None scheduled' : formatDate(status.currentPeriodEnd)
              }
            />
          </dl>

          {isBillingOwner &&
          status.subscriptionId !== null &&
          status.version !== null ? (
            <div className="mt-6 flex flex-wrap gap-3">
              {status.cancelAtPeriodEnd ? (
                <ActionForm
                  action={resumeBillingAction}
                  submitLabel="Resume renewal"
                >
                  <input type="hidden" name="guildId" value={guildId} />
                  <input
                    type="hidden"
                    name="subscriptionId"
                    value={status.subscriptionId}
                  />
                  <input type="hidden" name="expectedVersion" value={status.version} />
                  <input type="hidden" name="idempotencyKey" value={createId('mut')} />
                </ActionForm>
              ) : status.status === 'ACTIVE' ? (
                <ActionForm
                  action={cancelBillingAction}
                  submitLabel="Cancel at period end"
                >
                  <input type="hidden" name="guildId" value={guildId} />
                  <input
                    type="hidden"
                    name="subscriptionId"
                    value={status.subscriptionId}
                  />
                  <input type="hidden" name="expectedVersion" value={status.version} />
                  <input type="hidden" name="idempotencyKey" value={createId('mut')} />
                </ActionForm>
              ) : null}
              {status.provider === 'STRIPE' ? (
                <form action={openBillingPortalAction}>
                  <input type="hidden" name="guildId" value={guildId} />
                  <input
                    type="hidden"
                    name="subscriptionId"
                    value={status.subscriptionId}
                  />
                  <input type="hidden" name="idempotencyKey" value={createId('mut')} />
                  <Button type="submit" variant="secondary">
                    Manage payment method
                  </Button>
                </form>
              ) : null}
            </div>
          ) : status.subscriptionId !== null ? (
            <p className="mt-5 text-sm text-[var(--muted)]">
              Only the verified billing owner may change or cancel this subscription.
            </p>
          ) : null}
        </Card>

        <Card>
          <h3 className="text-lg font-bold">Premium features</h3>
          <ul className="mt-5 grid gap-2 text-sm text-[var(--muted)] sm:grid-cols-2">
            {[
              'Advanced AutoMod limits',
              'Extended moderation history',
              'Advanced logging filters',
              'Ticket transcript retention',
              'Scheduled messages',
              'Advanced analytics',
              'Custom branding controls',
              'Premium support badge',
            ].map((feature) => (
              <li key={feature}>✓ {feature}</li>
            ))}
          </ul>
        </Card>
      </div>

      {notifications.length > 0 ? (
        <Card>
          <h3 className="font-bold">Billing notifications</h3>
          <div className="mt-4 grid gap-3">
            {notifications.map((notification) => (
              <div key={notification.id}>
                <p className="font-semibold">{notification.title}</p>
                <p className="text-sm text-[var(--muted)]">{notification.message}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {notification.createdAt.toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {status.subscriptionId === null ? (
        <div>
          <h3 className="text-xl font-bold">Choose a recurring provider</h3>
          <div className="mt-4 grid gap-5 md:grid-cols-2">
            <ProviderCard
              title="Pay with Stripe"
              available={stripe?.ready === true}
              recurring
              currency={plan.currency}
              reason={stripe?.reasonCodes[0]}
            >
              <BillingCheckoutForm
                guildId={guildId}
                planCode={plan.code}
                provider="STRIPE"
                disabled={stripe?.ready !== true}
              />
            </ProviderCard>
            <ProviderCard
              title="Pay with PayTR"
              available={paytr?.ready === true}
              recurring={paytr?.recurring === true}
              currency={plan.currency}
              reason={paytr?.reasonCodes[0] ?? 'PAYTR_RECURRING_CAPABILITY_UNVERIFIED'}
            >
              {paytr?.ready === true ? (
                <BillingCheckoutForm
                  guildId={guildId}
                  planCode={plan.code}
                  provider="PAYTR"
                />
              ) : null}
            </ProviderCard>
          </div>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h3 className="font-bold">Payment history</h3>
          <div className="mt-4 space-y-3 text-sm">
            {payments.length === 0 ? (
              <p className="text-[var(--muted)]">No verified payments.</p>
            ) : (
              payments.map((payment) => (
                <div key={payment.id} className="flex justify-between gap-3">
                  <span>{payment.type.toLowerCase().replaceAll('_', ' ')}</span>
                  <span>
                    {formatConfiguredPrice(
                      payment.amountMinor,
                      CurrencyCodeSchema.parse(payment.currency),
                    )}{' '}
                    ·{' '}
                    {payment.status.toLowerCase()}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>
        <Card>
          <h3 className="font-bold">Billing audit trail</h3>
          <div className="mt-4 space-y-3 text-sm">
            {auditEvents.length === 0 ? (
              <p className="text-[var(--muted)]">No billing activity.</p>
            ) : (
              auditEvents.map((event) => (
                <div key={event.id}>
                  <p>{event.action}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {event.createdAt.toLocaleString()} · {event.source}
                  </p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function BillingFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}

function ProviderCard({
  title,
  available,
  recurring,
  currency,
  reason,
  children,
}: {
  title: string;
  available: boolean;
  recurring: boolean;
  currency: string;
  reason: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <Card className={!available ? 'opacity-70' : ''}>
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-bold">{title}</h4>
        <span className="text-xs font-semibold">
          {available ? 'Available' : 'Unavailable'}
        </span>
      </div>
      <p className="mt-3 text-sm text-[var(--muted)]">
        {recurring ? 'Automatic monthly renewal' : 'No verified recurring support'} ·{' '}
        {currency}
      </p>
      <p className="mt-2 text-xs text-[var(--muted)]">
        Payment details are handled on the provider-hosted secure flow.
      </p>
      {!available && reason !== undefined ? (
        <p className="mt-3 text-xs text-amber-500">Configuration: {reason}</p>
      ) : null}
      {children}
    </Card>
  );
}

function formatDate(value: string | null): string {
  return value === null ? '—' : new Date(value).toLocaleString();
}
