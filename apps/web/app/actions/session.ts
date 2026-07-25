'use server';

import { createId } from '@sufbot/shared';
import { appendAuditLog } from '@sufbot/database';
import { signOut } from '@/auth';
import { requireDashboardSession } from '@/lib/session';
import { prisma } from '@/lib/runtime';
import { validateMutationOrigin } from '@/lib/server-security';

export const revokeAllSessionsAction = async (): Promise<void> => {
  await validateMutationOrigin();
  const session = await requireDashboardSession();
  await prisma.$transaction(async (transaction) => {
    await transaction.user.update({
      where: { id: session.user.id },
      data: { sessionVersion: { increment: 1 } },
    });
    await transaction.authSession.updateMany({
      where: { userId: session.user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await transaction.oAuthCredential.deleteMany({ where: { userId: session.user.id } });
    await appendAuditLog(transaction, {
      actorUserId: session.user.id,
      actorDiscordId: session.user.discordId,
      action: 'auth.sessions.revoked',
      resourceType: 'UserSession',
      resourceId: session.user.id,
      requestId: createId('req'),
      outcome: 'SUCCESS',
    });
  });
  await signOut({ redirectTo: '/' });
};
