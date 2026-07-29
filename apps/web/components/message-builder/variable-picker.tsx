'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Clipboard, Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { templateVariables, type TemplateVariable } from '@/lib/message-builder';
import { cn } from '@/lib/utils';
import { useDashboardI18n } from '@/components/dashboard/dashboard-i18n';

const categories: readonly TemplateVariable['category'][] = [
  'user',
  'member',
  'server',
  'channel',
  'role',
  'verification',
  'invite',
  'date',
  'moderation',
  'ticket',
  'premium',
  'custom',
];

export function VariablePicker({
  open,
  recentlyUsed,
  onInsert,
  onClose,
}: {
  open: boolean;
  recentlyUsed: readonly string[];
  onInsert: (variable: TemplateVariable) => void;
  onClose: () => void;
}) {
  const { t } = useDashboardI18n();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<TemplateVariable['category'] | 'all'>('all');
  const [copied, setCopied] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const variables = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return templateVariables
      .filter((variable) => category === 'all' || variable.category === category)
      .filter(
        (variable) =>
          normalized === '' ||
          variable.token.toLowerCase().includes(normalized) ||
          variable.label.toLowerCase().includes(normalized) ||
          variable.description.toLowerCase().includes(normalized),
      )
      .sort((left, right) => {
        const leftRecent = recentlyUsed.indexOf(left.token);
        const rightRecent = recentlyUsed.indexOf(right.token);
        if (leftRecent === -1 && rightRecent === -1) return 0;
        if (leftRecent === -1) return 1;
        if (rightRecent === -1) return -1;
        return leftRecent - rightRecent;
      });
  }, [category, query, recentlyUsed]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => inputRef.current?.focus());
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [onClose, open]);

  if (!open) return null;

  const copy = async (token: string) => {
    await navigator.clipboard.writeText(token);
    setCopied(token);
    window.setTimeout(() => setCopied(null), 1200);
  };

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex justify-end bg-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('builder.variables')}
        className="flex h-full w-full max-w-lg flex-col border-l border-border-strong bg-surface-elevated shadow-lg"
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled])',
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
        }}
      >
        <div className="flex h-[var(--header-height)] shrink-0 items-center justify-between gap-3 border-b border-border px-4">
          <div>
            <p className="text-sm font-semibold">{t('builder.variables')}</p>
            <p className="type-help">Insert at the current cursor position.</p>
          </div>
          <Button type="button" size="icon-sm" variant="ghost" aria-label={t('common.close')} onClick={onClose}>
            <X size={17} />
          </Button>
        </div>
        <div className="border-b border-border p-3">
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle-foreground"
            />
            <Input
              ref={inputRef}
              value={query}
              placeholder="Search variables…"
              className="pl-9"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              className={cn(
                'rounded-full border px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap',
                category === 'all'
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground',
              )}
              onClick={() => setCategory('all')}
            >
              All
            </button>
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap capitalize',
                  category === item
                    ? 'border-primary/30 bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground',
                )}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="grid gap-2">
            {variables.map((variable) => (
              <div
                key={variable.token}
                className="group rounded-lg border border-border p-3 transition-colors hover:border-border-strong hover:bg-surface-secondary"
              >
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => onInsert(variable)}
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <code className="text-xs font-semibold text-primary">{variable.token}</code>
                      {variable.premium ? <Badge variant="premium">Premium</Badge> : null}
                      {recentlyUsed.includes(variable.token) ? (
                        <Badge variant="outline">Recent</Badge>
                      ) : null}
                    </span>
                    <span className="mt-2 block text-sm font-semibold">{variable.label}</span>
                    <span className="type-help mt-1 block">{variable.description}</span>
                    <span className="type-help mt-1.5 block">
                      Example: <strong className="text-foreground">{variable.example}</strong>
                    </span>
                  </button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`${t('common.copy')} ${variable.token}`}
                    onClick={() => void copy(variable.token)}
                  >
                    {copied === variable.token ? <Check size={14} /> : <Clipboard size={14} />}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
