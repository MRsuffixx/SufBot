import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table';
import { PageHeader } from '@/components/dashboard/page-primitives';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { prisma } from '@/lib/runtime';

const columns: readonly DataTableColumn[] = [
  { key: 'time', label: 'Time', sortable: true },
  { key: 'action', label: 'Action', sortable: true },
  { key: 'actor', label: 'Actor', sortable: true },
  { key: 'resource', label: 'Resource', sortable: true },
  { key: 'outcome', label: 'Outcome', sortable: true },
  { key: 'request', label: 'Request ID', hideOnMobile: true },
];

export default async function AuditLogsPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const events = await prisma.guildAuditLog.findMany({
    where: { guildId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return (
    <>
      <PageHeader
        eyebrow="Logging"
        title="Audit log"
        description="Sensitive configuration actions are append-oriented and redacted before insertion."
        status={<Badge variant="neutral">{events.length} events</Badge>}
      />
      <Card className="overflow-hidden p-0">
        <DataTable
          columns={columns}
          rows={events.map((event) => ({
            id: event.id,
            cells: {
              time: {
                value: event.createdAt.toLocaleString(),
                sortValue: event.createdAt.getTime(),
                tone: 'muted',
              },
              action: { value: event.action },
              actor: {
                value: event.actorDiscordId ?? 'system',
                mono: event.actorDiscordId !== null,
              },
              resource: { value: event.resourceType },
              outcome: {
                value: event.outcome,
                tone: event.outcome === 'SUCCESS' ? 'success' : 'danger',
              },
              request: { value: event.requestId, mono: true },
            },
          }))}
          searchPlaceholder="Search actions, actors, resources, or request IDs…"
          emptyTitle="No audit events yet"
          emptyDescription="Audited configuration changes will appear here."
          pageSize={20}
        />
      </Card>
    </>
  );
}
