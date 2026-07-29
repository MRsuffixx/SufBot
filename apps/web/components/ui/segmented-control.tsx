'use client';

import { cn } from '@/lib/utils';

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
};

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'grid grid-cols-[repeat(var(--segments),minmax(0,1fr))] gap-1 rounded-lg border border-border bg-surface-secondary p-1',
        className,
      )}
      style={{ '--segments': options.length } as React.CSSProperties}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={option.description}
            className={cn(
              'min-h-9 rounded-md px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-[color,background-color,box-shadow] hover:text-foreground',
              selected && 'bg-surface-elevated text-foreground shadow-sm',
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
