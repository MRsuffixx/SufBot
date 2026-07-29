'use client';

import Link from 'next/link';
import { ChevronLeft, ChevronRight, Crown, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GuildSwitcher } from './guild-switcher';
import {
  auxiliaryNavigation,
  createDashboardNavigation,
  currentGuildIdFromPath,
  isNavigationItemActive,
  navigationIcons,
} from './navigation';
import { useDashboardI18n } from './dashboard-i18n';
import type { DashboardGuildSummary, DashboardUserSummary } from './types';

export function DashboardSidebar({
  pathname,
  guilds,
  user,
  collapsed,
  mobileOpen,
  onCollapse,
  onCloseMobile,
  onOpenPalette,
}: {
  pathname: string;
  guilds: readonly DashboardGuildSummary[];
  user: DashboardUserSummary;
  collapsed: boolean;
  mobileOpen: boolean;
  onCollapse: () => void;
  onCloseMobile: () => void;
  onOpenPalette: () => void;
}) {
  const { t, locale, setLocale } = useDashboardI18n();
  const currentGuildId = currentGuildIdFromPath(pathname);
  const currentGuild = guilds.find((guild) => guild.id === currentGuildId) ?? null;
  const groups = createDashboardNavigation(currentGuildId);
  const BrandIcon = navigationIcons.brand;

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-[calc(var(--z-drawer)-1)] bg-overlay lg:hidden"
          aria-label={t('nav.close')}
          onClick={onCloseMobile}
        />
      ) : null}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-[var(--z-drawer)] flex w-[var(--sidebar-current-width)] flex-col border-r border-border bg-surface-elevated/97 p-2.5 shadow-lg backdrop-blur-xl transition-[width,transform] duration-[var(--duration-slow)] lg:z-[var(--z-header)] lg:translate-x-0 lg:shadow-none',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label={t('app.controlCenter')}
      >
        <div className="flex h-12 items-center gap-2 px-1">
          <Link
            href="/dashboard"
            className={cn(
              'flex min-w-0 items-center gap-2.5 rounded-md',
              collapsed && 'mx-auto justify-center',
            )}
            onClick={onCloseMobile}
            title={collapsed ? 'SufBot' : undefined}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--brand-gradient)] text-white shadow-md">
              <BrandIcon size={19} />
            </span>
            {!collapsed ? (
              <span className="min-w-0">
                <span className="block text-base font-bold tracking-tight">SufBot</span>
                <span className="type-help block -mt-0.5">{t('app.dashboard')}</span>
              </span>
            ) : null}
          </Link>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="ml-auto lg:hidden"
            aria-label={t('nav.close')}
            onClick={onCloseMobile}
          >
            <X size={17} />
          </Button>
        </div>

        <div className="mt-2">
          <GuildSwitcher
            guilds={guilds}
            currentGuild={currentGuild}
            collapsed={collapsed}
            onNavigate={onCloseMobile}
          />
        </div>

        <button
          type="button"
          className={cn(
            'mt-2.5 flex h-10 w-full items-center gap-2.5 rounded-md border border-border bg-background/65 px-3 text-left text-xs font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground',
            collapsed && 'justify-center px-0',
          )}
          onClick={onOpenPalette}
          aria-label={t('search.open')}
          title={collapsed ? t('search.open') : undefined}
        >
          <Search size={15} className="shrink-0" />
          {!collapsed ? (
            <>
              <span className="min-w-0 flex-1 truncate">{t('search.placeholder')}</span>
              <kbd className="hidden px-1.5 py-0.5 text-[10px] xl:inline">⌘K</kbd>
            </>
          ) : null}
        </button>

        <nav className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3">
          {groups.map((group) => (
            <div key={group.labelKey} className="mb-4">
              {!collapsed ? (
                <p className="mb-1.5 px-2 text-[10px] font-bold tracking-[0.12em] text-subtle-foreground uppercase">
                  {t(group.labelKey)}
                </p>
              ) : (
                <div className="mx-auto mb-1.5 h-px w-7 bg-border" />
              )}
              <div className="grid gap-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isNavigationItemActive(item, pathname);
                  const content = (
                    <>
                      <Icon
                        size={16}
                        className={cn('shrink-0', active && 'text-primary')}
                        aria-hidden="true"
                      />
                      {!collapsed ? (
                        <>
                          <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
                          {item.premium ? (
                            <Crown size={13} className="text-premium" aria-label={t('common.premium')} />
                          ) : null}
                          {item.disabled ? (
                            <Badge variant="outline" className="px-1.5">
                              {t('nav.soon')}
                            </Badge>
                          ) : null}
                        </>
                      ) : item.premium ? (
                        <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-premium" />
                      ) : null}
                    </>
                  );
                  const className = cn(
                    'relative flex min-h-9 items-center gap-2.5 rounded-md px-2.5 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:bg-surface-secondary hover:text-foreground',
                    item.nested && !collapsed && 'ml-3 border-l border-border pl-4',
                    collapsed && 'justify-center px-0',
                    active && 'bg-primary/10 text-foreground',
                    item.disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent',
                  );
                  return item.href === undefined || item.disabled ? (
                    <button
                      key={item.labelKey}
                      type="button"
                      className={className}
                      disabled
                      title={collapsed ? t(item.labelKey) : undefined}
                    >
                      {content}
                    </button>
                  ) : (
                    <Link
                      key={item.labelKey}
                      href={item.href}
                      className={className}
                      aria-current={active ? 'page' : undefined}
                      title={collapsed ? t(item.labelKey) : undefined}
                      onClick={onCloseMobile}
                    >
                      {content}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-border pt-2">
          {auxiliaryNavigation.map((item) => {
            const Icon = item.icon;
            const active = isNavigationItemActive(item, pathname);
            return (
              <Link
                key={item.labelKey}
                href={item.href ?? '/dashboard'}
                className={cn(
                  'flex min-h-9 items-center gap-2.5 rounded-md px-2.5 text-[0.8125rem] font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground',
                  collapsed && 'justify-center px-0',
                  active && 'bg-primary/10 text-foreground',
                )}
                aria-current={active ? 'page' : undefined}
                title={collapsed ? t(item.labelKey) : undefined}
                onClick={onCloseMobile}
              >
                <Icon size={16} />
                {!collapsed ? <span className="truncate">{t(item.labelKey)}</span> : null}
              </Link>
            );
          })}

          {!collapsed ? (
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-surface-secondary p-2">
              {user.image === null ? (
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/12 text-xs font-bold text-primary">
                  {user.name.slice(0, 2).toUpperCase()}
                </span>
              ) : (
                <img src={user.image} alt="" width={32} height={32} className="size-8 rounded-md" />
              )}
              <Link href="/dashboard/profile" className="min-w-0 flex-1" onClick={onCloseMobile}>
                <span className="block truncate text-xs font-semibold">{user.name}</span>
                <span className="block truncate text-[10px] text-subtle-foreground">
                  {user.platformRole}
                </span>
              </Link>
              <button
                type="button"
                className="rounded px-1.5 py-1 text-[10px] font-bold text-muted-foreground hover:bg-surface-muted"
                onClick={() => setLocale(locale === 'en' ? 'tr' : 'en')}
                aria-label={locale === 'en' ? 'Türkçe kullan' : 'Use English'}
              >
                {locale.toUpperCase()}
              </button>
            </div>
          ) : (
            <Link
              href="/dashboard/profile"
              className="mx-auto mt-2 grid size-9 place-items-center rounded-md bg-surface-secondary text-xs font-bold text-primary"
              title={user.name}
            >
              {user.name.slice(0, 2).toUpperCase()}
            </Link>
          )}

          <Button
            type="button"
            variant="ghost"
            size={collapsed ? 'icon-sm' : 'sm'}
            className={cn('mt-2 hidden text-muted-foreground lg:flex', !collapsed && 'w-full')}
            aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
            title={collapsed ? t('nav.expand') : undefined}
            onClick={onCollapse}
          >
            {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
            {!collapsed ? t('nav.collapse') : null}
          </Button>
        </div>
      </aside>
    </>
  );
}
