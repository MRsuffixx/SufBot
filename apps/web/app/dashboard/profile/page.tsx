import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { revokeAllSessionsAction } from '@/app/actions/session';
import { requireDashboardSession } from '@/lib/session';
import { prisma } from '@/lib/runtime';

export default async function ProfilePage() {
  const session = await requireDashboardSession();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      discordId: true,
      displayName: true,
      platformRole: true,
      lastLoginAt: true,
      createdAt: true,
      sessionVersion: true,
    },
  });
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-4xl font-black tracking-tight">Profile and sessions</h1>
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <Card>
          <h2 className="text-lg font-bold">Discord identity</h2>
          <dl className="mt-5 grid gap-4 text-sm">
            <div>
              <dt className="text-[var(--muted)]">Display name</dt>
              <dd className="mt-1 font-semibold">{user.displayName}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Discord ID</dt>
              <dd className="mt-1 font-mono">{user.discordId}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Platform role</dt>
              <dd className="mt-1 font-semibold">{user.platformRole}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Last sign-in</dt>
              <dd className="mt-1">{user.lastLoginAt?.toLocaleString() ?? 'Unknown'}</dd>
            </div>
          </dl>
        </Card>
        <Card>
          <h2 className="text-lg font-bold">Session security</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            Revoking sessions increments your server-side session version and deletes encrypted
            Discord OAuth credentials.
          </p>
          <p className="mt-5 text-xs text-[var(--muted)]">
            Current session version: {user.sessionVersion}
          </p>
          <form action={revokeAllSessionsAction} className="mt-6">
            <Button type="submit" variant="danger">
              Revoke all sessions
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
