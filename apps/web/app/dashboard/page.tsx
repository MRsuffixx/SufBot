import Link from 'next/link';
import {
  ArrowRight,
  Clock3,
  KeyRound,
  Server,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  EmptyState,
  PageContainer,
  PageHeader,
  SectionHeader,
  StatCard,
} from '@/components/dashboard/page-primitives';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { requireDashboardSession } from '@/lib/session';
import { prisma } from '@/lib/runtime';

export default async function DashboardHome() {
  const session = await requireDashboardSession();
  const [manageableGuilds, recentAccess, activePremium] = await Promise.all([
    prisma.guildAccessGrant.count({
      where: { userId: session.user.id, expiresAt: { gt: new Date() } },
    }),
    prisma.dashboardAccessLog.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 6,
      include: { guild: { select: { name: true } } },
    }),
    prisma.guildSubscription.count({
      where: {
        purchaserUserId: session.user.id,
        status: { in: ['ACTIVE', 'GRACE_PERIOD'] },
      },
    }),
  ]);
  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Control center"
        title={`Welcome back, ${session.user.name ?? 'administrator'}.`}
        description="Choose a Discord server, review recent work, and continue from the configuration area that needs attention."
        actions={
          <Link href="/dashboard/guilds" className={buttonVariants()}>
            Open a server <ArrowRight size={16} />
          </Link>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<Server size={17} />}
          label="Manageable servers"
          value={manageableGuilds}
          detail="Refreshed from Discord authorization"
        />
        <StatCard
          icon={<ShieldCheck size={17} />}
          label="Platform role"
          value={session.user.platformRole}
          detail="Current dashboard authority"
        />
        <StatCard
          icon={<Sparkles size={17} />}
          label="Premium servers"
          value={activePremium}
          detail="Active or in grace period"
        />
        <StatCard
          icon={<KeyRound size={17} />}
          label="Session policy"
          value="24h"
          detail="Server-side revocation supported"
        />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <Card>
          <SectionHeader
            title="Recent dashboard activity"
            description="Your latest protected dashboard routes."
          />
          {recentAccess.length === 0 ? (
            <EmptyState
              className="mt-4 min-h-44"
              title="No dashboard activity yet"
              description="Open a Discord server to begin configuring SufBot."
              action={
                <Link href="/dashboard/guilds" className={buttonVariants({ size: 'sm' })}>
                  Choose a server
                </Link>
              }
            />
          ) : (
            <div className="mt-4 divide-y divide-border">
              {recentAccess.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 py-3.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-surface-secondary text-primary">
                    <Clock3 size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {entry.guild?.name ?? 'Dashboard'}
                    </p>
                    <p className="type-help mt-0.5 truncate">{entry.route}</p>
                  </div>
                  <time className="type-help shrink-0">{entry.createdAt.toLocaleString()}</time>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="overflow-hidden border-primary/20 bg-[linear-gradient(145deg,var(--surface-elevated),color-mix(in_srgb,var(--primary)_8%,var(--surface-elevated)))]">
          <span className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Server size={19} />
          </span>
          <h2 className="mt-5 text-lg font-bold">Everything starts with a server</h2>
          <p className="type-page-subtitle mt-2">
            Installation health, permissions, modules, messages, audit history, and billing remain
            isolated per Discord server.
          </p>
          <Link href="/dashboard/guilds" className={`${buttonVariants()} mt-6`}>
            View servers <ArrowRight size={16} />
          </Link>
        </Card>
      </div>
    </PageContainer>
  );
}
