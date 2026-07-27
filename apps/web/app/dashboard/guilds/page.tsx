import Link from 'next/link';
import { Bot, LockKeyhole, Settings, ShieldAlert, UserRoundCog } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { loadDashboardGuilds } from '@/lib/discord';
import { requireDashboardSession } from '@/lib/session';

export default async function GuildSelectionPage() {
  const session = await requireDashboardSession();
  const guilds = await loadDashboardGuilds(session.user.id);
  return (
    <div className="mx-auto max-w-6xl">
      <p className="text-sm font-bold uppercase tracking-[.18em] text-violet-600">Discord guilds</p>
      <h1 className="mt-3 text-4xl font-black tracking-tight">Select a community</h1>
      <p className="mt-3 text-[var(--muted)]">
        Guild permission data was refreshed from Discord for this view.
      </p>
      <div className="mt-9 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {guilds.map((guild) => (
          <Card key={guild.id} className={!guild.canManage ? 'opacity-65' : ''}>
            <div className="flex items-start gap-4">
              {guild.icon === null ? (
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-violet-600 font-black text-white">
                  {guild.name.slice(0, 2).toUpperCase()}
                </span>
              ) : (
                // Discord guild icons are immutable content-addressed assets for this guild.
                <img
                  src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=96`}
                  alt=""
                  width={48}
                  height={48}
                  className="size-12 rounded-xl"
                />
              )}
              <div className="min-w-0">
                <h2 className="truncate font-bold">{guild.name}</h2>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--muted)]">
                  {guild.canManage ? <UserRoundCog size={14} /> : <LockKeyhole size={14} />}
                  {guild.canManage ? 'Can manage' : 'No management permission'}
                </p>
              </div>
            </div>
            <div className="mt-7 flex items-center justify-between gap-3">
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(
                  guild.canManage,
                  guild.installation.state,
                )}`}
              >
                {statusLabel(guild.canManage, guild.installation.state)}
              </span>
              <GuildActions guild={guild} />
            </div>
          </Card>
        ))}
      </div>
      {guilds.length === 0 ? (
        <Card className="mt-9 text-center">
          <p className="font-semibold">Discord returned no guilds for this account.</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Sign out and authorize the guilds scope again.
          </p>
        </Card>
      ) : null}
    </div>
  );
}

function GuildActions({
  guild,
}: {
  guild: Awaited<ReturnType<typeof loadDashboardGuilds>>[number];
}) {
  if (!guild.canManage) {
    return (
      <button className={buttonVariants({ size: 'sm', variant: 'secondary' })} disabled>
        <LockKeyhole size={14} /> Insufficient permission
      </button>
    );
  }
  if (guild.installation.state === 'not-installed') {
    return (
      <a
        href={`/invite?${new URLSearchParams({ guildId: guild.id, intent: 'install' })}`}
        className={buttonVariants({ size: 'sm', variant: 'secondary' })}
      >
        <Bot size={14} /> Invite Bot
      </a>
    );
  }
  if (guild.installation.state === 'missing-permissions') {
    return (
      <div className="flex flex-wrap justify-end gap-2">
        <Link href={`/dashboard/guilds/${guild.id}`} className={buttonVariants({ size: 'sm' })}>
          <Settings size={14} /> Open Dashboard
        </Link>
        <a
          href={`/invite?${new URLSearchParams({ guildId: guild.id, intent: 'repair' })}`}
          className={buttonVariants({ size: 'sm', variant: 'secondary' })}
        >
          <ShieldAlert size={14} /> Fix Permissions
        </a>
      </div>
    );
  }
  if (guild.installation.canOpenDashboard) {
    return (
      <Link href={`/dashboard/guilds/${guild.id}`} className={buttonVariants({ size: 'sm' })}>
        <Settings size={14} /> Open Dashboard
      </Link>
    );
  }
  return (
    <button className={buttonVariants({ size: 'sm', variant: 'secondary' })} disabled>
      Status unavailable
    </button>
  );
}

function statusLabel(
  canManage: boolean,
  state: Awaited<ReturnType<typeof loadDashboardGuilds>>[number]['installation']['state'],
): string {
  if (!canManage) return 'Insufficient user permission';
  const labels = {
    'not-installed': 'Bot not installed',
    'installed-online': 'Bot installed and online',
    'installed-offline': 'Bot offline',
    'missing-permissions': 'Administrator missing',
    configured: 'Bot configured',
    'status-unavailable': 'Status unavailable',
  } as const;
  return labels[state];
}

function statusClass(
  canManage: boolean,
  state: Awaited<ReturnType<typeof loadDashboardGuilds>>[number]['installation']['state'],
): string {
  if (!canManage) return 'bg-slate-500/10 text-slate-500';
  if (state === 'configured' || state === 'installed-online') {
    return 'bg-emerald-500/10 text-emerald-500';
  }
  if (state === 'missing-permissions') return 'bg-red-500/10 text-red-500';
  return 'bg-amber-500/10 text-amber-500';
}
