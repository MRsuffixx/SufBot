import { redirect } from 'next/navigation';
import { appendAuditLog } from '@sufbot/database';
import { createId } from '@sufbot/shared';
import { botInviteUrl, loadGuildInstallation, requireLiveGuildAccess } from '@/lib/discord';
import { requireDashboardSession } from '@/lib/session';
import { prisma } from '@/lib/runtime';

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ guildId?: string; intent?: string }>;
}) {
  const { guildId, intent } = await searchParams;
  if (guildId !== undefined) {
    if (!/^\d{17,20}$/.test(guildId)) redirect('/dashboard/guilds');
    const session = await requireDashboardSession();
    const [access, installation] = await Promise.all([
      requireLiveGuildAccess(session.user.id, guildId),
      loadGuildInstallation(guildId),
    ]);
    const repairing = intent === 'repair' || installation.state === 'missing-permissions';
    await appendAuditLog(prisma, {
      guildId,
      actorUserId: session.user.id,
      actorDiscordId: access.discordUserId,
      action: repairing ? 'bot.permission-repair.requested' : 'bot.installation.requested',
      resourceType: 'DiscordGuildInstallation',
      resourceId: guildId,
      requestId: createId('invite'),
      outcome: 'SUCCESS',
      metadata: {
        previousState: installation.state,
        requestedPermissionBitfield: '8',
      },
    });
  }
  redirect(botInviteUrl(guildId));
}
