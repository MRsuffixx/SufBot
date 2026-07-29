import { redirect } from 'next/navigation';
import { PageContainer, PermissionWarning } from '@/components/dashboard/page-primitives';
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
    <PageContainer width="wide">
      {installation.requiresReauthorization ? (
        <PermissionWarning
          title="Bot permissions need attention"
          description={`${guild.name} is connected, but SufBot cannot safely operate every configured module until its Discord permissions are repaired.`}
          actionHref={`/invite?${new URLSearchParams({ guildId, intent: 'repair' })}`}
          actionLabel="Fix permissions"
        />
      ) : null}
      <div className={installation.requiresReauthorization ? 'pt-5' : ''}>{children}</div>
    </PageContainer>
  );
}
