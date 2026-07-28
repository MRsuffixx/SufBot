import 'server-only';

import { AuthorizationError } from '@sufbot/shared';
import { requireDashboardSession } from '@/lib/session';
import { prisma, webEnvironment } from '@/lib/runtime';

export const requireBillingAdmin = async () => {
  const session = await requireDashboardSession();
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { discordId: true },
  });
  const immutablePlatformOperators = new Set([
    ...webEnvironment.BOT_OWNER_DISCORD_IDS,
    ...webEnvironment.BOT_DEVELOPER_DISCORD_IDS,
  ]);
  if (
    user === null ||
    !immutablePlatformOperators.has(user.discordId) ||
    !webEnvironment.BILLING_ADMIN_DISCORD_IDS.includes(user.discordId)
  ) {
    throw new AuthorizationError(
      'An immutable platform billing role is required.',
      'BILLING_ADMIN_REQUIRED',
    );
  }
  return { session, discordUserId: user.discordId };
};
