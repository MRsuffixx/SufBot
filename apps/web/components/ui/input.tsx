import * as React from 'react';
import { cn } from '@/lib/utils';

export const controlClassName =
  'h-[var(--control-height)] w-full rounded-md border border-border bg-surface-elevated px-3 text-sm text-foreground shadow-xs transition-[border-color,box-shadow,background-color] placeholder:text-subtle-foreground hover:border-border-strong focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-subtle-foreground';

export function Input({ className, type, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input type={type} className={cn(controlClassName, className)} {...props} />;
}
