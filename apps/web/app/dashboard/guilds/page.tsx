import Link from 'next/link';
import { Bot, LockKeyhole, Settings, UserRoundCog } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { loadDashboardGuilds, botInviteUrl } from '@/lib/discord';
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
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  guild.botInstalled
                    ? 'bg-emerald-500/10 text-emerald-500'
                    : 'bg-amber-500/10 text-amber-500'
                }`}
              >
                {guild.botInstalled ? 'Bot installed' : 'Not installed'}
              </span>
              {guild.canManage && guild.botInstalled ? (
                <Link
                  href={`/dashboard/guilds/${guild.id}`}
                  className={buttonVariants({ size: 'sm' })}
                >
                  <Settings size={14} /> Manage
                </Link>
              ) : guild.canManage ? (
                <a
                  href={botInviteUrl(guild.id)}
                  className={buttonVariants({ size: 'sm', variant: 'secondary' })}
                >
                  <Bot size={14} /> Invite
                </a>
              ) : (
                <button className={buttonVariants({ size: 'sm', variant: 'secondary' })} disabled>
                  Unavailable
                </button>
              )}
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
