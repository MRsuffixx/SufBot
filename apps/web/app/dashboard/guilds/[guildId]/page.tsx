import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  Blocks,
  Bot,
  Check,
  CircleGauge,
  Command,
  Crown,
  Database,
  MessageCircleMore,
  RadioTower,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UsersRound,
  X,
} from 'lucide-react';
import { refreshGuildStatusAction } from '@/app/actions/guild';
import { ActionForm } from '@/components/action-form';
import {
  EmptyState,
  PageHeader,
  PermissionWarning,
  SectionHeader,
  StatCard,
} from '@/components/dashboard/page-primitives';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { loadGuildInstallation } from '@/lib/discord';
import { cache, ensureCacheConnection, prisma } from '@/lib/runtime';

export default async function GuildOverview({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const [guild, settings, enabledModules, overrides, recentAudit, installation, redisReady, premium] =
    await Promise.all([
      prisma.guild.findUniqueOrThrow({
        where: { id: guildId },
        select: { name: true, iconHash: true, joinedAt: true },
      }),
      prisma.guildSettings.findUnique({ where: { guildId } }),
      prisma.guildModule.count({ where: { guildId, enabled: true } }),
      prisma.guildCommandOverride.count({ where: { guildId } }),
      prisma.guildAuditLog.findMany({
        where: { guildId },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
      loadGuildInstallation(guildId),
      ensureCacheConnection()
        .then(() => cache.ping())
        .catch(() => false),
      prisma.guildSubscription.count({
        where: { guildId, status: { in: ['ACTIVE', 'GRACE_PERIOD'] } },
      }),
    ]);
  const healthy =
    installation.online &&
    installation.administrator === true &&
    installation.rolePositionWarning !== true;
  const checklist = [
    { label: 'SufBot installed', complete: installation.installed },
    { label: 'Bot online', complete: installation.online },
    { label: 'Administrator permission', complete: installation.administrator === true },
    { label: 'Core module configured', complete: enabledModules > 0 },
    { label: 'Server preferences saved', complete: settings !== null },
  ];
  const completedChecklist = checklist.filter((item) => item.complete).length;

  return (
    <>
      <PageHeader
        eyebrow="Server overview"
        title={guild.name}
        description="Monitor installation health, finish setup, and jump directly to the controls your team uses most."
        status={
          <>
            <Badge variant={healthy ? 'success' : 'warning'}>
              {healthy ? 'Healthy' : 'Needs attention'}
            </Badge>
            {premium > 0 ? <Badge variant="premium">Premium</Badge> : null}
          </>
        }
        actions={
          <ActionForm action={refreshGuildStatusAction} submitLabel="Refresh status">
            <input type="hidden" name="guildId" value={guildId} />
          </ActionForm>
        }
      />

      <Card className="relative overflow-hidden border-primary/15 p-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,var(--primary),transparent_45%),radial-gradient(circle_at_80%_10%,var(--premium),transparent_42%),linear-gradient(135deg,var(--surface-elevated),var(--surface-secondary))] opacity-20" />
        <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
          {guild.iconHash === null ? (
            <span className="grid size-16 shrink-0 place-items-center rounded-xl bg-[var(--brand-gradient)] text-xl font-bold text-white shadow-md">
              {guild.name.slice(0, 2).toUpperCase()}
            </span>
          ) : (
            <img
              src={`https://cdn.discordapp.com/icons/${guildId}/${guild.iconHash}.png?size=128`}
              alt=""
              width={64}
              height={64}
              className="size-16 rounded-xl shadow-md"
            />
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-bold">{guild.name}</h2>
            <p className="type-help mt-1">
              Managed with SufBot since {guild.joinedAt.toLocaleDateString()}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge variant={installation.online ? 'success' : 'warning'}>
                <span className="size-1.5 rounded-full bg-current" />
                {installation.online ? 'Bot online' : 'Bot offline'}
              </Badge>
              <Badge variant={installation.administrator === false ? 'danger' : 'neutral'}>
                {installation.administrator === false ? 'Permission repair needed' : 'Permissions healthy'}
              </Badge>
              {premium > 0 ? (
                <Badge variant="premium">
                  <Crown size={11} /> Premium active
                </Badge>
              ) : (
                <Badge variant="outline">Free plan</Badge>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center sm:w-64">
            <div className="rounded-lg border border-border bg-surface-elevated/75 p-3 backdrop-blur">
              <p className="text-xl font-bold">{enabledModules}</p>
              <p className="type-help">Modules</p>
            </div>
            <div className="rounded-lg border border-border bg-surface-elevated/75 p-3 backdrop-blur">
              <p className="text-xl font-bold">—</p>
              <p className="type-help">Members</p>
            </div>
          </div>
        </div>
      </Card>

      {!healthy ? (
        <div className="mt-5">
          <PermissionWarning
            title="A server health check needs your attention"
            description={
              installation.requiresReauthorization
                ? 'SufBot is missing Discord permissions required by configured modules.'
                : 'The bot is offline or its live status is unavailable. Configuration remains safe in the database.'
            }
            {...(installation.requiresReauthorization
              ? {
                  actionHref: `/invite?${new URLSearchParams({ guildId, intent: 'repair' })}`,
                  actionLabel: 'Fix permissions',
                }
              : {})}
          />
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<Blocks size={17} />}
          label="Enabled modules"
          value={enabledModules}
          detail="Active server capabilities"
        />
        <StatCard
          icon={<Command size={17} />}
          label="Command overrides"
          value={overrides}
          detail="Role and channel policies"
        />
        <StatCard
          icon={<ShieldCheck size={17} />}
          label="Settings version"
          value={settings?.version ?? 1}
          detail="Optimistic concurrency version"
        />
        <StatCard
          icon={<CircleGauge size={17} />}
          label="Setup progress"
          value={`${completedChecklist}/${checklist.length}`}
          detail={`${Math.round((completedChecklist / checklist.length) * 100)}% complete`}
        />
      </div>

      <section className="mt-7">
        <SectionHeader
          title="Quick actions"
          description="Open the most frequently used configuration surfaces."
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <QuickAction
            href={`/dashboard/guilds/${guildId}/onboarding/welcome`}
            icon={<Sparkles size={18} />}
            title="Configure welcome"
            description="Message builder, delivery, and welcome card"
          />
          <QuickAction
            href={`/dashboard/guilds/${guildId}/commands`}
            icon={<Command size={18} />}
            title="Open command manager"
            description="Review overrides and command access"
          />
          <QuickAction
            href={`/dashboard/guilds/${guildId}/modules`}
            icon={<Blocks size={18} />}
            title="Manage modules"
            description="Enable the capabilities this server needs"
          />
          {installation.requiresReauthorization ? (
            <QuickAction
              href={`/invite?${new URLSearchParams({ guildId, intent: 'repair' })}`}
              icon={<ShieldAlert size={18} />}
              title="Fix bot permissions"
              description="Reauthorize the required Discord permissions"
              external
              attention
            />
          ) : (
            <QuickAction
              href={`/dashboard/guilds/${guildId}/settings`}
              icon={<Settings size={18} />}
              title="Server settings"
              description="Language, timezone, and legacy prefix"
            />
          )}
          <QuickAction
            href={`/dashboard/guilds/${guildId}/premium`}
            icon={<Crown size={18} />}
            title={premium > 0 ? 'Manage Premium' : 'Upgrade Premium'}
            description="Subscription, limits, and payment history"
            premium
          />
          <QuickAction
            href={`/dashboard/guilds/${guildId}/onboarding/verification`}
            icon={<UsersRound size={18} />}
            title="Verification setup"
            description="Resources, captcha, and permission plan"
          />
        </div>
      </section>

      <div className="mt-7 grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <Card>
          <SectionHeader
            title="Setup checklist"
            description={`${completedChecklist} of ${checklist.length} tasks complete`}
          />
          <div className="mt-5 grid gap-2">
            {checklist.map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-3 rounded-md border border-border bg-surface-secondary/55 px-3 py-2.5"
              >
                <span
                  className={`grid size-6 place-items-center rounded-full ${
                    item.complete
                      ? 'bg-success-surface text-success'
                      : 'bg-surface-muted text-subtle-foreground'
                  }`}
                >
                  {item.complete ? <Check size={13} /> : <X size={13} />}
                </span>
                <span className="text-sm font-medium">{item.label}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader
            title="Recent configuration changes"
            description="The latest audited changes for this server."
            action={
              <Link
                href={`/dashboard/guilds/${guildId}/audit-logs`}
                className={buttonVariants({ variant: 'ghost', size: 'sm' })}
              >
                View audit log <ArrowRight size={14} />
              </Link>
            }
          />
          {recentAudit.length === 0 ? (
            <EmptyState
              className="mt-4 min-h-40"
              title="No configuration changes yet"
              description="Audited changes will appear here after your first save."
            />
          ) : (
            <div className="mt-4 divide-y divide-border">
              {recentAudit.map((event) => (
                <div key={event.id} className="flex items-start gap-3 py-3.5">
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-surface-secondary text-primary">
                    <Activity size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{event.action}</p>
                    <p className="type-help mt-0.5">{event.resourceType}</p>
                  </div>
                  <time className="type-help shrink-0">{event.createdAt.toLocaleString()}</time>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-5">
        <SectionHeader
          title="Connection diagnostics"
          description="Live services and Discord installation state."
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Diagnostic icon={<Bot size={16} />} label="Bot installed" value={installation.installed ? 'Yes' : 'No'} />
          <Diagnostic icon={<RadioTower size={16} />} label="Bot online" value={installation.online ? 'Yes' : 'No'} />
          <Diagnostic
            icon={<ShieldCheck size={16} />}
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
            icon={<Activity size={16} />}
            label="Role hierarchy"
            value={
              installation.rolePositionWarning === null
                ? 'Unknown'
                : installation.rolePositionWarning
                  ? 'Needs review'
                  : 'Healthy'
            }
          />
          <Diagnostic icon={<Database size={16} />} label="Database" value="Connected" />
          <Diagnostic
            icon={<RadioTower size={16} />}
            label="Redis"
            value={redisReady ? 'Connected' : 'Unavailable'}
          />
          <Diagnostic
            icon={<Command size={16} />}
            label="Commands"
            value={installation.commandRegistration?.status ?? 'Unknown'}
          />
          <Diagnostic
            icon={<MessageCircleMore size={16} />}
            label="Configuration sync"
            value={
              installation.lastConfigurationSyncAt === null
                ? 'Unavailable'
                : new Date(installation.lastConfigurationSyncAt).toLocaleString()
            }
          />
        </div>
      </Card>
    </>
  );
}

function QuickAction({
  href,
  icon,
  title,
  description,
  premium = false,
  attention = false,
  external = false,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  premium?: boolean;
  attention?: boolean;
  external?: boolean;
}) {
  const className =
    'group flex items-start gap-3 rounded-lg border border-border bg-surface-elevated p-4 shadow-xs transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-border-strong hover:shadow-sm';
  const content = (
    <>
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-md ${
          premium
            ? 'bg-premium-surface text-premium'
            : attention
              ? 'bg-danger-surface text-danger'
              : 'bg-primary/10 text-primary'
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-semibold">
          {title}
          <ArrowRight
            size={14}
            className="ml-auto text-subtle-foreground transition-transform group-hover:translate-x-0.5"
          />
        </span>
        <span className="type-help mt-1 block">{description}</span>
      </span>
    </>
  );
  return external ? (
    <a href={href} className={className}>
      {content}
    </a>
  ) : (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}

function Diagnostic({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-secondary/45 p-3.5">
      <span className="text-primary">{icon}</span>
      <p className="type-help mt-3">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold capitalize">{value}</p>
    </div>
  );
}
