import { Card } from '@/components/ui/card';
import { prisma } from '@/lib/runtime';

export default async function AuditLogsPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const events = await prisma.guildAuditLog.findMany({
    where: { guildId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Append-oriented audit log</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Latest 50 sensitive actions. Secrets are redacted before insertion.
          </p>
        </div>
        <span className="text-xs text-[var(--muted)]">{events.length} event(s)</span>
      </div>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="py-3">Time</th>
              <th>Action</th>
              <th>Actor</th>
              <th>Resource</th>
              <th>Outcome</th>
              <th>Request</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {events.map((event) => (
              <tr key={event.id}>
                <td className="py-4 text-xs text-[var(--muted)]">
                  {event.createdAt.toLocaleString()}
                </td>
                <td className="font-semibold">{event.action}</td>
                <td>{event.actorDiscordId ?? 'system'}</td>
                <td>{event.resourceType}</td>
                <td className={event.outcome === 'SUCCESS' ? 'text-emerald-500' : 'text-red-500'}>
                  {event.outcome}
                </td>
                <td>
                  <code className="text-xs">{event.requestId}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {events.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--muted)]">No audit events yet.</p>
        ) : null}
      </div>
    </Card>
  );
}
