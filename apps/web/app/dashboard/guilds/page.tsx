import { GuildSelector } from '@/components/dashboard/guild-selector';
import { PageContainer, PageHeader } from '@/components/dashboard/page-primitives';
import { loadDashboardGuilds } from '@/lib/discord';
import { prisma } from '@/lib/runtime';
import { requireDashboardSession } from '@/lib/session';

export default async function GuildSelectionPage() {
  const session = await requireDashboardSession();
  const guilds = await loadDashboardGuilds(session.user.id);
  const guildIds = guilds.map((guild) => guild.id);
  const [premiumSubscriptions, recentAccess] = await Promise.all([
    prisma.guildSubscription.findMany({
      where: { guildId: { in: guildIds }, status: { in: ['ACTIVE', 'GRACE_PERIOD'] } },
      select: { guildId: true },
      distinct: ['guildId'],
    }),
    prisma.dashboardAccessLog.findMany({
      where: { userId: session.user.id, guildId: { in: guildIds } },
      orderBy: { createdAt: 'desc' },
      select: { guildId: true, createdAt: true },
      take: 100,
    }),
  ]);
  const premiumGuildIds = new Set(premiumSubscriptions.map((subscription) => subscription.guildId));
  const recentlyOpened = new Map<string, Date>();
  for (const event of recentAccess) {
    if (event.guildId !== null && !recentlyOpened.has(event.guildId)) {
      recentlyOpened.set(event.guildId, event.createdAt);
    }
  }
  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Discord servers"
        title="Choose a community"
        description="Open an installed server, repair permissions, or invite SufBot. Discord access and installation health are refreshed before sensitive changes."
      />
      <GuildSelector
        guilds={guilds.map((guild) => ({
          id: guild.id,
          name: guild.name,
          icon: guild.icon,
          canManage: guild.canManage,
          owner: guild.owner,
          premium: premiumGuildIds.has(guild.id),
          memberCount: null,
          recentlyOpenedAt: recentlyOpened.get(guild.id)?.toISOString() ?? null,
          installation: {
            state: guild.installation.state,
            online: guild.installation.online,
            canOpenDashboard: guild.installation.canOpenDashboard,
          },
        }))}
      />
    </PageContainer>
  );
}
