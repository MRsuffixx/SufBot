import { Activity, Blocks, Command, ShieldCheck } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { prisma } from '@/lib/runtime';

export default async function GuildOverview({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const [settings, enabledModules, overrides, recentAudit] = await Promise.all([
    prisma.guildSettings.findUnique({ where: { guildId } }),
    prisma.guildModule.count({ where: { guildId, enabled: true } }),
    prisma.guildCommandOverride.count({ where: { guildId } }),
    prisma.guildAuditLog.findMany({
      where: { guildId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric icon={Blocks} label="Enabled modules" value={String(enabledModules)} />
        <Metric icon={Command} label="Command overrides" value={String(overrides)} />
        <Metric icon={ShieldCheck} label="Settings version" value={String(settings?.version ?? 1)} />
        <Metric icon={Activity} label="Locale" value={(settings?.locale ?? 'en').toUpperCase()} />
      </div>
      <Card className="mt-6">
        <h2 className="text-lg font-bold">Recent sensitive changes</h2>
        <div className="mt-4 divide-y">
          {recentAudit.length === 0 ? (
            <p className="py-5 text-sm text-[var(--muted)]">No audit records yet.</p>
          ) : (
            recentAudit.map((event) => (
              <div key={event.id} className="flex flex-wrap justify-between gap-3 py-4 text-sm">
                <div>
                  <p className="font-semibold">{event.action}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">{event.resourceType}</p>
                </div>
                <span className="text-xs text-[var(--muted)]">{event.createdAt.toLocaleString()}</span>
              </div>
            ))
          )}
        </div>
      </Card>
    </>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Blocks; label: string; value: string }) {
  return (
    <Card>
      <Icon size={19} className="text-violet-600" />
      <p className="mt-6 text-2xl font-black">{value}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">{label}</p>
    </Card>
  );
}

