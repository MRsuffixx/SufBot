import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { requireDashboardSession } from '@/lib/session';
import { appConfig, prisma } from '@/lib/runtime';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireDashboardSession();
  const grants = await prisma.guildAccessGrant.findMany({
    where: { userId: session.user.id, expiresAt: { gt: new Date() } },
    orderBy: { updatedAt: 'desc' },
    take: 50,
    select: {
      guild: {
        select: {
          id: true,
          name: true,
          iconHash: true,
          botInstalled: true,
          botLastSeenAt: true,
          botHasAdministrator: true,
          subscriptions: {
            where: { status: { in: ['ACTIVE', 'GRACE_PERIOD'] } },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });
  const onlineThreshold = Date.now() - 2 * 60 * 1000;
  const guilds = grants.map(({ guild }) => ({
    id: guild.id,
    name: guild.name,
    iconHash: guild.iconHash,
    botInstalled: guild.botInstalled,
    botOnline:
      guild.botInstalled &&
      guild.botLastSeenAt !== null &&
      guild.botLastSeenAt.getTime() >= onlineThreshold,
    permissionHealthy: guild.botHasAdministrator,
    premiumActive: guild.subscriptions.length > 0,
  }));

  return (
    <DashboardShell
      user={{
        name: session.user.name ?? 'Discord administrator',
        image: session.user.image ?? null,
        platformRole: session.user.platformRole,
      }}
      guilds={guilds}
      initialLocale={appConfig.application.defaultLocale}
    >
      {children}
    </DashboardShell>
  );
}
