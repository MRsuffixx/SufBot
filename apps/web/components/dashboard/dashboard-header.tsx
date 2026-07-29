'use client';

import Link from 'next/link';
import { Bell, ChevronRight, Menu, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { currentGuildIdFromPath } from './navigation';
import { useDashboardI18n } from './dashboard-i18n';
import { useUnsavedChanges } from './unsaved-changes';
import type { DashboardGuildSummary, DashboardUserSummary } from './types';

const routeTitleKeys = {
  modules: 'nav.modules',
  onboarding: 'nav.onboarding',
  welcome: 'nav.welcome',
  goodbye: 'nav.goodbye',
  verification: 'nav.verification',
  roles: 'nav.roles',
  commands: 'nav.commands',
  'audit-logs': 'nav.auditLogs',
  premium: 'nav.premium',
  settings: 'nav.settings',
  profile: 'nav.profile',
} as const;

export function DashboardHeader({
  pathname,
  guilds,
  user,
  onOpenMobile,
  onOpenPalette,
}: {
  pathname: string;
  guilds: readonly DashboardGuildSummary[];
  user: DashboardUserSummary;
  onOpenMobile: () => void;
  onOpenPalette: () => void;
}) {
  const { t } = useDashboardI18n();
  const { dirty } = useUnsavedChanges();
  const currentGuildId = currentGuildIdFromPath(pathname);
  const guild = guilds.find((item) => item.id === currentGuildId) ?? null;
  const segments = pathname.split('/').filter(Boolean);
  const lastSegment = segments.at(-1) ?? 'dashboard';
  const pageTitle =
    lastSegment === 'dashboard'
      ? t('nav.overview')
      : lastSegment === 'guilds'
        ? t('nav.servers')
        : /^\d{17,20}$/u.test(lastSegment)
          ? t('nav.overview')
          : routeTitleKeys[lastSegment as keyof typeof routeTitleKeys] === undefined
            ? t('app.dashboard')
            : t(routeTitleKeys[lastSegment as keyof typeof routeTitleKeys]);

  return (
    <header className="sticky top-0 z-[var(--z-header)] h-[var(--header-height)] border-b border-border bg-background/88 backdrop-blur-xl">
      <div className="flex h-full items-center gap-3 px-3 sm:px-5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label={t('nav.open')}
          onClick={onOpenMobile}
        >
          <Menu size={19} />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="hidden items-center gap-1 text-[11px] text-subtle-foreground sm:flex">
            <Link href="/dashboard">{t('app.dashboard')}</Link>
            {guild === null ? null : (
              <>
                <ChevronRight size={11} />
                <Link href={`/dashboard/guilds/${guild.id}`} className="truncate">
                  {guild.name}
                </Link>
              </>
            )}
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-sm font-bold sm:text-base">{pageTitle}</h1>
            {dirty ? (
              <Badge variant="warning" className="hidden sm:inline-flex">
                {t('header.unsaved')}
              </Badge>
            ) : null}
          </div>
        </div>

        {guild === null ? null : (
          <div className="hidden items-center gap-1.5 xl:flex">
            <Badge variant={guild.botOnline ? 'success' : 'warning'}>
              <span className="size-1.5 rounded-full bg-current" />
              {guild.botOnline ? t('guild.online') : t('guild.offline')}
            </Badge>
            <Badge variant={guild.permissionHealthy === false ? 'danger' : 'neutral'}>
              {guild.permissionHealthy === false
                ? t('guild.permissionsRequired')
                : t('guild.permissionsHealthy')}
            </Badge>
          </div>
        )}

        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="hidden min-w-48 justify-start text-muted-foreground md:flex"
          onClick={onOpenPalette}
        >
          <Search size={15} />
          <span className="flex-1 truncate text-left">{t('common.search')}</span>
          <kbd className="px-1.5 py-0.5 text-[10px]">⌘K</kbd>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="md:hidden"
          aria-label={t('search.open')}
          onClick={onOpenPalette}
        >
          <Search size={17} />
        </Button>
        <details className="relative">
          <summary className="grid size-8 cursor-pointer list-none place-items-center rounded-md text-muted-foreground hover:bg-surface-secondary hover:text-foreground [&::-webkit-details-marker]:hidden">
            <Bell size={17} aria-label={t('header.notifications')} />
          </summary>
          <div className="absolute top-11 right-0 w-72 rounded-lg border border-border-strong bg-surface-elevated p-4 shadow-lg">
            <p className="text-sm font-semibold">{t('header.notifications')}</p>
            <p className="type-help mt-2">{t('header.noNotifications')}</p>
          </div>
        </details>
        <ThemeToggle />
        <Link
          href="/dashboard/profile"
          className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-md bg-primary/12 text-[10px] font-bold text-primary"
          title={user.name}
        >
          {user.image === null ? (
            user.name.slice(0, 2).toUpperCase()
          ) : (
            <img src={user.image} alt="" width={32} height={32} className="size-8" />
          )}
        </Link>
      </div>
    </header>
  );
}
