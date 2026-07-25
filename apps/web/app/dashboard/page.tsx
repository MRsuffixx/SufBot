import Link from 'next/link';
import { ArrowRight, KeyRound, Server, ShieldCheck } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { requireDashboardSession } from '@/lib/session';
import { prisma } from '@/lib/runtime';

export default async function DashboardHome() {
  const session = await requireDashboardSession();
  const [manageableGuilds, recentAccess] = await Promise.all([
    prisma.guildAccessGrant.count({
      where: { userId: session.user.id, expiresAt: { gt: new Date() } },
    }),
    prisma.dashboardAccessLog.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);
  return (
    <div className="mx-auto max-w-6xl">
      <p className="text-sm font-bold uppercase tracking-[.18em] text-violet-600">Control room</p>
      <h1 className="mt-3 text-4xl font-black tracking-tight">
        Welcome back, {session.user.name ?? 'administrator'}.
      </h1>
      <p className="mt-3 text-[var(--muted)]">
        Permissions are refreshed from Discord before every sensitive guild change.
      </p>
      <div className="mt-9 grid gap-5 sm:grid-cols-3">
        <Summary icon={Server} label="Verified guilds" value={String(manageableGuilds)} />
        <Summary icon={ShieldCheck} label="Platform role" value={session.user.platformRole} />
        <Summary icon={KeyRound} label="Session policy" value="24 hours" />
      </div>
      <Card className="mt-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">Choose a guild</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              See installation state and live administrator eligibility.
            </p>
          </div>
          <Link href="/dashboard/guilds" className={buttonVariants()}>
            View guilds <ArrowRight size={16} />
          </Link>
        </div>
      </Card>
      {recentAccess.length > 0 ? (
        <Card className="mt-7">
          <h2 className="font-bold">Recent dashboard access</h2>
          <div className="mt-4 divide-y">
            {recentAccess.map((entry) => (
              <div key={entry.id} className="flex justify-between gap-4 py-3 text-sm">
                <span>{entry.route}</span>
                <span className="text-[var(--muted)]">{entry.createdAt.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function Summary({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Server;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <Icon size={20} className="text-violet-600" />
      <p className="mt-7 text-2xl font-black">{value}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">{label}</p>
    </Card>
  );
}

