import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_20px_70px_-36px_rgba(44,29,92,.35)]',
        className,
      )}
      {...props}
    />
  );
}

