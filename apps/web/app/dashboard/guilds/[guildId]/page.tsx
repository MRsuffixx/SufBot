import {
  Activity,
  Blocks,
  Command,
  Database,
  RadioTower,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { refreshGuildStatusAction } from '@/app/actions/guild';
import { ActionForm } from '@/components/action-form';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { loadGuildInstallation } from '@/lib/discord';
import { cache, ensureCacheConnection, prisma } from '@/lib/runtime';

export default async function GuildOverview({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const [settings, enabledModules, overrides, recentAudit, installation, redisReady] =
    await Promise.all([
      prisma.guildSettings.findUnique({ where: { guildId } }),
      prisma.guildModule.count({ where: { guildId, enabled: true } }),
      prisma.guildCommandOverride.count({ where: { guildId } }),
      prisma.guildAuditLog.findMany({
        where: { guildId },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      loadGuildInstallation(guildId),
      ensureCacheConnection()
        .then(() => cache.ping())
        .catch(() => false),
    ]);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric icon={Blocks} label="Enabled modules" value={String(enabledModules)} />
        <Metric icon={Command} label="Command overrides" value={String(overrides)} />
        <Metric
          icon={ShieldCheck}
          label="Settings version"
          value={String(settings?.version ?? 1)}
        />
        <Metric icon={Activity} label="Locale" value={(settings?.locale ?? 'en').toUpperCase()} />
      </div>
      <Card className="mt-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">Connection diagnostics</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Live bot status takes priority over persisted installation history.
            </p>
          </div>
          {installation.requiresReauthorization ? (
            <a
              href={`/invite?${new URLSearchParams({ guildId, intent: 'repair' })}`}
              className={buttonVariants({ size: 'sm', variant: 'secondary' })}
            >
              <ShieldAlert size={14} /> Fix Permissions
            </a>
          ) : null}
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Diagnostic label="Bot installed" value={installation.installed ? 'Yes' : 'No'} />
          <Diagnostic label="Bot online" value={installation.online ? 'Yes' : 'No'} />
          <Diagnostic
            label="Administrator"
            value={
              installation.administrator === null
                ? 'Unknown'
                : installation.administrator
                  ? 'Granted'
                  : 'Missing'
            }
          />
          <Diagnostic
            label="Role hierarchy"
            value={
              installation.rolePositionWarning === null
                ? 'Unknown'
                : installation.rolePositionWarning
                  ? 'Needs review'
                  : 'Healthy'
            }
          />
          <Diagnostic
            label="Command registration"
            value={installation.commandRegistration?.status ?? 'Unknown'}
          />
          <Diagnostic label="Database" value="Connected" icon={Database} />
          <Diagnostic
            label="Redis"
            value={redisReady ? 'Connected' : 'Unavailable'}
            icon={RadioTower}
          />
          <Diagnostic
            label="Last bot heartbeat"
            value={
              installation.lastBotHeartbeat === null
                ? 'Unavailable'
                : new Date(installation.lastBotHeartbeat).toLocaleString()
            }
          />
          <Diagnostic
            label="Last configuration sync"
            value={
              installation.lastConfigurationSyncAt === null
                ? 'Unavailable'
                : new Date(installation.lastConfigurationSyncAt).toLocaleString()
            }
          />
        </div>
        <ActionForm action={refreshGuildStatusAction} submitLabel="Refresh status" className="mt-6">
          <input type="hidden" name="guildId" value={guildId} />
        </ActionForm>
      </Card>
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
                <span className="text-xs text-[var(--muted)]">
                  {event.createdAt.toLocaleString()}
                </span>
              </div>
            ))
          )}
        </div>
      </Card>
    </>
  );
}

function Diagnostic({
  label,
  value,
  icon: Icon = ShieldCheck,
}: {
  label: string;
  value: string;
  icon?: typeof ShieldCheck;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] p-4">
      <Icon size={17} className="text-violet-600" />
      <p className="mt-4 text-xs text-[var(--muted)]">{label}</p>
      <p className="mt-1 font-semibold capitalize">{value}</p>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Blocks;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <Icon size={19} className="text-violet-600" />
      <p className="mt-6 text-2xl font-black">{value}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">{label}</p>
    </Card>
  );
}
