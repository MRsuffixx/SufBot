'use client';

import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Switch({
  className,
  label,
  description,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: string;
  description?: string;
}) {
  return (
    <label
      className={cn(
        'group flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-md border border-border bg-surface-elevated px-3.5 py-2.5 transition-colors hover:border-border-strong has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus/30 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-55',
        className,
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        {description === undefined ? null : (
          <span className="type-help mt-0.5 block">{description}</span>
        )}
      </span>
      <span className="relative inline-flex shrink-0">
        <input {...props} type="checkbox" className="peer sr-only" />
        <span className="h-6 w-10 rounded-full bg-surface-muted transition-colors peer-checked:bg-primary peer-focus-visible:outline-none" />
        <span className="pointer-events-none absolute top-1 left-1 size-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  );
}
