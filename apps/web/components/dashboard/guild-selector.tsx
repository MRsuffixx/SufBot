'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Bot,
  CheckCircle2,
  Clock3,
  Crown,
  Search,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  UserRoundCog,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { EmptyState, FilterBar } from './page-primitives';
import { cn } from '@/lib/utils';

type GuildSelectorItem = {
  id: string;
  name: string;
  icon: string | null;
  canManage: boolean;
  owner: boolean;
  premium: boolean;
  memberCount: number | null;
  recentlyOpenedAt: string | null;
  installation: {
    state:
      | 'not-installed'
      | 'installed-online'
      | 'installed-offline'
      | 'missing-permissions'
      | 'configured'
      | 'status-unavailable';
    online: boolean;
    canOpenDashboard: boolean;
  };
};

type GuildFilter = 'all' | 'installed' | 'install' | 'premium' | 'attention';

export function GuildSelector({ guilds }: { guilds: readonly GuildSelectorItem[] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<GuildFilter>('all');
  const [sort, setSort] = useState<'name' | 'recent' | 'members'>('name');
  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return [...guilds]
      .filter((guild) => normalized === '' || guild.name.toLowerCase().includes(normalized))
      .filter((guild) => {
        if (filter === 'installed') return guild.installation.state !== 'not-installed';
        if (filter === 'install') return guild.installation.state === 'not-installed';
        if (filter === 'premium') return guild.premium;
        if (filter === 'attention') {
          return (
            !guild.canManage ||
            guild.installation.state === 'missing-permissions' ||
            guild.installation.state === 'installed-offline' ||
            guild.installation.state === 'status-unavailable'
          );
        }
        return true;
      })
      .sort((left, right) => {
        if (sort === 'recent') {
          return (
            (right.recentlyOpenedAt === null ? 0 : Date.parse(right.recentlyOpenedAt)) -
            (left.recentlyOpenedAt === null ? 0 : Date.parse(left.recentlyOpenedAt))
          );
        }
        if (sort === 'members') return (right.memberCount ?? -1) - (left.memberCount ?? -1);
        return left.name.localeCompare(right.name);
      });
  }, [filter, guilds, query, sort]);
  const hasMemberCounts = guilds.some((guild) => guild.memberCount !== null);

  return (
    <>
      <FilterBar>
        <div className="relative min-w-0 flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle-foreground"
          />
          <Input
            value={query}
            placeholder="Search servers…"
            className="pl-9"
            aria-label="Search servers"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="flex min-w-0 gap-2">
          <div className="relative min-w-0 flex-1 sm:w-44 sm:flex-none">
            <SlidersHorizontal
              size={14}
              className="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2 text-subtle-foreground"
            />
            <Select
              value={filter}
              className="pl-9"
              aria-label="Filter servers"
              onChange={(event) => setFilter(event.target.value as GuildFilter)}
            >
              <option value="all">All servers</option>
              <option value="installed">Installed</option>
              <option value="install">Needs installation</option>
              <option value="premium">Premium</option>
              <option value="attention">Needs attention</option>
            </Select>
          </div>
          <Select
            value={sort}
            className="min-w-0 flex-1 sm:w-44 sm:flex-none"
            aria-label="Sort servers"
            onChange={(event) => setSort(event.target.value as typeof sort)}
          >
            <option value="name">Name</option>
            <option value="recent">Recently opened</option>
            <option value="members" disabled={!hasMemberCounts}>
              Member count
            </option>
          </Select>
        </div>
      </FilterBar>

      {visible.length === 0 ? (
        <EmptyState
          className="mt-5"
          title={guilds.length === 0 ? 'No Discord servers found' : 'No matching servers'}
          description={
            guilds.length === 0
              ? 'Authorize the guilds scope again to refresh your Discord server list.'
              : 'Adjust the search or filters to see more servers.'
          }
        />
      ) : (
        <div className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {visible.map((guild) => (
            <GuildCard key={guild.id} guild={guild} />
          ))}
        </div>
      )}
    </>
  );
}

function GuildCard({ guild }: { guild: GuildSelectorItem }) {
  const attention =
    guild.installation.state === 'missing-permissions' ||
    guild.installation.state === 'installed-offline' ||
    guild.installation.state === 'status-unavailable';
  return (
    <Card
      variant="interactive"
      className={cn('relative overflow-hidden', !guild.canManage && 'opacity-70')}
    >
      <div
        className="absolute inset-x-0 top-0 h-20 bg-[radial-gradient(circle_at_20%_0%,var(--primary),transparent_58%),linear-gradient(90deg,var(--surface-secondary),transparent)] opacity-12"
        aria-hidden="true"
      />
      <div className="relative flex items-start gap-3.5">
        {guild.icon === null ? (
          <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-[var(--brand-gradient)] text-sm font-bold text-white shadow-sm">
            {guild.name.slice(0, 2).toUpperCase()}
          </span>
        ) : (
          <img
            src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=96`}
            alt=""
            width={48}
            height={48}
            className="size-12 rounded-lg shadow-sm"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-sm font-semibold">{guild.name}</h2>
            {guild.premium ? <Crown size={14} className="shrink-0 text-premium" /> : null}
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <UserRoundCog size={13} />
            {guild.canManage
              ? guild.owner
                ? 'Server owner'
                : 'Manage Server'
              : 'Insufficient permission'}
          </p>
        </div>
      </div>

      <div className="relative mt-5 flex flex-wrap gap-1.5">
        <GuildStatusBadge guild={guild} />
        {guild.premium ? <Badge variant="premium">Premium</Badge> : null}
        {guild.memberCount === null ? null : (
          <Badge variant="outline">{guild.memberCount.toLocaleString()} members</Badge>
        )}
      </div>

      <div className="relative mt-5 flex min-h-8 items-center justify-between gap-3 border-t border-border pt-4">
        <p className="flex min-w-0 items-center gap-1.5 text-[11px] text-subtle-foreground">
          <Clock3 size={12} className="shrink-0" />
          {guild.recentlyOpenedAt === null
            ? 'Not opened yet'
            : `Opened ${new Date(guild.recentlyOpenedAt).toLocaleDateString()}`}
        </p>
        <GuildPrimaryAction guild={guild} attention={attention} />
      </div>
    </Card>
  );
}

function GuildStatusBadge({ guild }: { guild: GuildSelectorItem }) {
  if (!guild.canManage) return <Badge variant="neutral">No access</Badge>;
  if (guild.installation.state === 'not-installed') {
    return (
      <Badge variant="info">
        <Bot size={11} /> Not installed
      </Badge>
    );
  }
  if (guild.installation.state === 'missing-permissions') {
    return (
      <Badge variant="danger">
        <ShieldAlert size={11} /> Fix permissions
      </Badge>
    );
  }
  if (guild.installation.state === 'installed-offline') {
    return <Badge variant="warning">Bot offline</Badge>;
  }
  if (guild.installation.state === 'status-unavailable') {
    return <Badge variant="warning">Status unavailable</Badge>;
  }
  return (
    <Badge variant="success">
      <CheckCircle2 size={11} /> {guild.installation.online ? 'Online' : 'Connected'}
    </Badge>
  );
}

function GuildPrimaryAction({
  guild,
  attention,
}: {
  guild: GuildSelectorItem;
  attention: boolean;
}) {
  if (!guild.canManage) {
    return (
      <span className={buttonVariants({ size: 'sm', variant: 'secondary' })} aria-disabled="true">
        Insufficient permission
      </span>
    );
  }
  if (guild.installation.state === 'not-installed') {
    return (
      <a
        href={`/invite?${new URLSearchParams({ guildId: guild.id, intent: 'install' })}`}
        className={buttonVariants({ size: 'sm' })}
      >
        <Bot size={14} /> Invite bot
      </a>
    );
  }
  if (guild.installation.state === 'missing-permissions') {
    return (
      <a
        href={`/invite?${new URLSearchParams({ guildId: guild.id, intent: 'repair' })}`}
        className={buttonVariants({ size: 'sm', variant: 'danger' })}
      >
        <ShieldAlert size={14} /> Fix permissions
      </a>
    );
  }
  if (guild.installation.canOpenDashboard) {
    return (
      <Link href={`/dashboard/guilds/${guild.id}`} className={buttonVariants({ size: 'sm' })}>
        <Settings size={14} /> {attention ? 'Review status' : 'Open dashboard'}
      </Link>
    );
  }
  return (
    <span className={buttonVariants({ size: 'sm', variant: 'secondary' })} aria-disabled="true">
      Status unavailable
    </span>
  );
}
