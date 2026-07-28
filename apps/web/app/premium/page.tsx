import { EntitlementService, configuredPlan, formatConfiguredPrice } from '@sufbot/billing';
import { Card } from '@/components/ui/card';
import { BillingCheckoutForm } from '@/components/billing-checkout-form';
import { loadDashboardGuilds } from '@/lib/discord';
import { requireDashboardSession } from '@/lib/session';
import { appConfig, billingProviders, cache, prisma } from '@/lib/runtime';

export const dynamic = 'force-dynamic';

export default async function PremiumPage() {
  const session = await requireDashboardSession();
  const [guilds, providerCapabilities] = await Promise.all([
    loadDashboardGuilds(session.user.id),
    Promise.all(
      [...billingProviders.values()].map((provider) => provider.checkCapabilities()),
    ),
  ]);
  const plan = configuredPlan(appConfig);
  const entitlementService = new EntitlementService(prisma, appConfig, cache);
  const statuses = new Map(
    await Promise.all(
      guilds.map(async (guild) => [
        guild.id,
        await entitlementService.getGuildPremiumStatus(guild.id),
      ] as const),
    ),
  );
  const stripe = providerCapabilities.find((item) => item.provider === 'STRIPE');

  return (
    <main className="mx-auto max-w-6xl px-5 py-16">
      <p className="text-sm font-bold uppercase tracking-[.18em] text-violet-600">
        Guild Premium
      </p>
      <h1 className="mt-3 text-4xl font-black tracking-tight">
        One subscription, one selected guild
      </h1>
      <p className="mt-3 max-w-3xl text-[var(--muted)]">
        {plan.displayName} costs {formatConfiguredPrice(plan.amountMinor, plan.currency)} per
        month. Billing ownership and guild entitlement remain separate.
      </p>
      <div className="mt-10 grid gap-5 md:grid-cols-2">
        {guilds.map((guild) => {
          const status = statuses.get(guild.id);
          const eligible =
            guild.canManage &&
            guild.botInstalled &&
            status?.subscriptionId === null &&
            stripe?.ready === true;
          return (
            <Card key={guild.id}>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-bold">{guild.name}</h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {status?.premiumActive
                      ? 'Premium active'
                      : status?.subscriptionId !== null
                        ? `Subscription ${status?.status?.toLowerCase()}`
                        : !guild.canManage
                          ? 'Manage Guild permission required'
                          : !guild.botInstalled
                            ? 'Install the bot before purchasing'
                            : stripe?.ready !== true
                              ? 'No recurring provider is ready'
                              : 'Eligible for Premium'}
                  </p>
                </div>
                <span className="rounded-full bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-500">
                  {guild.botInstalled ? 'Bot installed' : 'Bot required'}
                </span>
              </div>
              {eligible ? (
                <BillingCheckoutForm
                  guildId={guild.id}
                  planCode={plan.code}
                  provider="STRIPE"
                />
              ) : null}
            </Card>
          );
        })}
      </div>
    </main>
  );
}
