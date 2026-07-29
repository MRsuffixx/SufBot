'use client';

import Link from 'next/link';
import { Check, ChevronsUpDown, Server } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDashboardI18n } from './dashboard-i18n';
import type { DashboardGuildSummary } from './types';

export function GuildSwitcher({
  guilds,
  currentGuild,
  collapsed,
  onNavigate,
}: {
  guilds: readonly DashboardGuildSummary[];
  currentGuild: DashboardGuildSummary | null;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const { t } = useDashboardI18n();
  return (
    <details className="group relative">
      <summary
        className={cn(
          'flex min-h-12 cursor-pointer list-none items-center gap-2.5 rounded-lg border border-border bg-surface-secondary p-2 text-left transition-colors hover:border-border-strong [&::-webkit-details-marker]:hidden',
          collapsed && 'justify-center',
        )}
        title={collapsed ? (currentGuild?.name ?? t('guild.select')) : undefined}
        aria-label={t('guild.switch')}
      >
        <GuildIcon guild={currentGuild} />
        {!collapsed ? (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">
                {currentGuild?.name ?? t('guild.select')}
              </span>
              <span className="type-help block truncate">
                {currentGuild === null
                  ? t('guild.switch')
                  : currentGuild.botOnline
                    ? t('guild.online')
                    : t('guild.offline')}
              </span>
            </span>
            <ChevronsUpDown size={14} className="text-subtle-foreground" aria-hidden="true" />
          </>
        ) : null}
      </summary>
      <div
        className={cn(
          'absolute top-[calc(100%+.5rem)] left-0 z-[var(--z-popover)] w-64 rounded-lg border border-border-strong bg-surface-elevated p-2 shadow-lg',
          collapsed && 'left-[calc(100%+.5rem)] -top-1',
        )}
      >
        <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
          {t('guild.switch')}
        </p>
        <div className="max-h-64 overflow-y-auto">
          {guilds.map((guild) => (
            <Link
              key={guild.id}
              href={`/dashboard/guilds/${guild.id}`}
              onClick={onNavigate}
              className="flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-surface-secondary"
            >
              <GuildIcon guild={guild} small />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{guild.name}</span>
              {guild.id === currentGuild?.id ? (
                <Check size={15} className="text-primary" aria-hidden="true" />
              ) : null}
            </Link>
          ))}
        </div>
        <Link
          href="/dashboard/guilds"
          onClick={onNavigate}
          className="mt-1 flex items-center gap-2 rounded-md border-t border-border px-2 pt-2 pb-1.5 text-xs font-semibold text-primary"
        >
          <Server size={14} /> {t('nav.servers')}
        </Link>
      </div>
    </details>
  );
}

function GuildIcon({
  guild,
  small = false,
}: {
  guild: DashboardGuildSummary | null;
  small?: boolean;
}) {
  const size = small ? 30 : 34;
  if (guild?.iconHash !== null && guild !== null) {
    return (
      <img
        src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.iconHash}.png?size=64`}
        alt=""
        width={size}
        height={size}
        className={cn('shrink-0 rounded-md', small ? 'size-[30px]' : 'size-[34px]')}
      />
    );
  }
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-md bg-primary/12 font-bold text-primary',
        small ? 'size-[30px] text-[10px]' : 'size-[34px] text-xs',
      )}
      aria-hidden="true"
    >
      {guild === null ? <Server size={small ? 14 : 16} /> : guild.name.slice(0, 2).toUpperCase()}
    </span>
  );
}
