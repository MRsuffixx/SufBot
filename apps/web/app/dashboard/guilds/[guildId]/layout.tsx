import { redirect } from 'next/navigation';
import { GuildNav } from '@/components/guild-nav';
import { requireDashboardSession } from '@/lib/session';
import { loadGuildInstallation, requireLiveGuildAccess } from '@/lib/discord';
import { prisma } from '@/lib/runtime';

export default async function GuildLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ guildId: string }>;
}) {
  const session = await requireDashboardSession();
  const { guildId } = await params;
  if (!/^\d{17,20}$/.test(guildId)) redirect('/unauthorized');
  try {
    await requireLiveGuildAccess(session.user.id, guildId);
  } catch {
    redirect('/unauthorized');
  }
  const [guild, installation] = await Promise.all([
    prisma.guild.findUnique({
      where: { id: guildId },
      select: { name: true },
    }),
    loadGuildInstallation(guildId),
  ]);
  if (guild === null) redirect('/unauthorized');
  if (!installation.canOpenDashboard) redirect('/dashboard/guilds');
  await prisma.dashboardAccessLog.create({
    data: {
      userId: session.user.id,
      guildId,
      route: `/dashboard/guilds/${guildId}`,
      requestId: `page_${Date.now()}`,
      outcome: 'SUCCESS',
    },
  });
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8">
        <p className="text-sm font-bold uppercase tracking-[.18em] text-violet-600">
          Guild control
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-black tracking-tight">{guild.name}</h1>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              installation.state === 'configured' || installation.state === 'installed-online'
                ? 'bg-emerald-500/10 text-emerald-500'
                : installation.state === 'missing-permissions'
                  ? 'bg-red-500/10 text-red-500'
                  : 'bg-amber-500/10 text-amber-500'
            }`}
          >
            {installation.state === 'configured'
              ? 'Connected'
              : installation.state === 'installed-online'
                ? 'Online'
                : installation.state === 'missing-permissions'
                  ? 'Permissions required'
                  : 'Bot offline'}
          </span>
        </div>
      </div>
      <GuildNav guildId={guildId} />
      <div className="pt-7">{children}</div>
    </div>
  );
}
