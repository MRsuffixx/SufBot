'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { DashboardI18nProvider } from './dashboard-i18n';
import { DashboardSidebar } from './dashboard-sidebar';
import { DashboardHeader } from './dashboard-header';
import { CommandPalette } from './command-palette';
import { UnsavedChangesProvider } from './unsaved-changes';
import { currentGuildIdFromPath } from './navigation';
import type { DashboardGuildSummary, DashboardUserSummary } from './types';
import type { DashboardLocale } from '@/lib/i18n/dashboard';

export function DashboardShell({
  user,
  guilds,
  initialLocale,
  children,
}: {
  user: DashboardUserSummary;
  guilds: readonly DashboardGuildSummary[];
  initialLocale: DashboardLocale;
  children: ReactNode;
}) {
  return (
    <DashboardI18nProvider initialLocale={initialLocale}>
      <UnsavedChangesProvider>
        <DashboardShellFrame user={user} guilds={guilds}>
          {children}
        </DashboardShellFrame>
      </UnsavedChangesProvider>
    </DashboardI18nProvider>
  );
}

function DashboardShellFrame({
  user,
  guilds,
  children,
}: {
  user: DashboardUserSummary;
  guilds: readonly DashboardGuildSummary[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem('sufbot-sidebar-collapsed') === 'true');
  }, []);

  useEffect(() => setMobileOpen(false), [pathname]);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem('sufbot-sidebar-collapsed', String(next));
      return next;
    });
  };

  const style = useMemo(
    () =>
      ({
        '--sidebar-current-width': collapsed
          ? 'var(--sidebar-width-collapsed)'
          : 'var(--sidebar-width)',
      }) as React.CSSProperties,
    [collapsed],
  );

  return (
    <div className="dashboard-app" style={style}>
      <a
        href="#dashboard-content"
        className="fixed top-2 left-2 z-[calc(var(--z-toast)+1)] -translate-y-20 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground focus:translate-y-0"
      >
        Skip to content
      </a>
      <DashboardSidebar
        pathname={pathname}
        guilds={guilds}
        user={user}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCollapse={toggleCollapsed}
        onCloseMobile={() => setMobileOpen(false)}
        onOpenPalette={() => setPaletteOpen(true)}
      />
      <div className="min-h-screen transition-[padding] duration-[var(--duration-slow)] lg:pl-[var(--sidebar-current-width)]">
        <DashboardHeader
          pathname={pathname}
          guilds={guilds}
          user={user}
          onOpenMobile={() => setMobileOpen(true)}
          onOpenPalette={() => setPaletteOpen(true)}
        />
        <main
          id="dashboard-content"
          className="min-w-0 px-3 py-5 sm:px-5 sm:py-7 lg:px-7 xl:px-9"
        >
          {children}
        </main>
      </div>
      <CommandPalette
        open={paletteOpen}
        guildId={currentGuildIdFromPath(pathname)}
        onOpenChange={setPaletteOpen}
      />
    </div>
  );
}
