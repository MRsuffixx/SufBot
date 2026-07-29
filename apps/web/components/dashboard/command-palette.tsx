'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  auxiliaryNavigation,
  createDashboardNavigation,
  type DashboardNavigationItem,
} from './navigation';
import { useDashboardI18n } from './dashboard-i18n';

export function CommandPalette({
  open,
  guildId,
  onOpenChange,
}: {
  open: boolean;
  guildId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useDashboardI18n();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const items = useMemo(
    () =>
      [...createDashboardNavigation(guildId).flatMap((group) => group.items), ...auxiliaryNavigation]
        .filter(
          (item): item is DashboardNavigationItem & { href: string } =>
            item.href !== undefined && item.disabled !== true,
        )
        .filter((item) => t(item.labelKey).toLowerCase().includes(query.trim().toLowerCase())),
    [guildId, query, t],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpenChange(!open);
      }
      if (open && event.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onOpenChange, open]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setSelected(0);
      return;
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => setSelected(0), [query]);

  if (!open) return null;

  const navigate = (item: DashboardNavigationItem & { href: string }) => {
    onOpenChange(false);
    router.push(item.href);
  };

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] grid items-start bg-overlay px-3 pt-[12vh] sm:px-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('search.open')}
        className="mx-auto w-full max-w-xl overflow-hidden rounded-xl border border-border-strong bg-surface-elevated shadow-lg"
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setSelected((value) => Math.min(value + 1, Math.max(0, items.length - 1)));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setSelected((value) => Math.max(0, value - 1));
          } else if (event.key === 'Enter' && items[selected] !== undefined) {
            event.preventDefault();
            navigate(items[selected]);
          } else if (event.key === 'Tab') {
            const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
              'button:not([disabled]), input:not([disabled]), a[href]',
            );
            if (focusable === undefined || focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first && last !== undefined) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last && first !== undefined) {
              event.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search size={18} className="text-subtle-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('search.placeholder')}
            aria-label={t('common.search')}
            className="h-14 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle-foreground"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('common.close')}
            onClick={() => onOpenChange(false)}
          >
            <X size={16} />
          </Button>
        </div>
        <div className="max-h-[min(420px,60vh)] overflow-y-auto p-2">
          {items.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              {t('search.empty')}
            </p>
          ) : (
            items.map((item, index) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.href}
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm',
                    index === selected
                      ? 'bg-primary/10 text-foreground'
                      : 'text-muted-foreground hover:bg-surface-secondary hover:text-foreground',
                  )}
                  onMouseEnter={() => setSelected(index)}
                  onClick={() => navigate(item)}
                >
                  <Icon size={16} className="shrink-0" />
                  <span className="flex-1">{t(item.labelKey)}</span>
                  {item.premium ? <span className="text-[10px] text-premium">Premium</span> : null}
                </button>
              );
            })
          )}
        </div>
        <p className="type-help border-t border-border px-4 py-2.5">{t('search.hint')}</p>
      </div>
    </div>
  );
}
