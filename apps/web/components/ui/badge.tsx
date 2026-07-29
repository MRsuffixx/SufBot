import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const badgeVariants = cva(
  'type-status inline-flex min-h-5 items-center gap-1.5 rounded-full border px-2 py-0.5',
  {
    variants: {
      variant: {
        neutral: 'border-border bg-surface-secondary text-muted-foreground',
        primary: 'border-primary/20 bg-primary/10 text-primary',
        success: 'border-success/20 bg-success-surface text-success',
        warning: 'border-warning/20 bg-warning-surface text-warning',
        danger: 'border-danger/20 bg-danger-surface text-danger',
        info: 'border-info/20 bg-info-surface text-info',
        premium: 'border-premium/25 bg-premium-surface text-premium',
        discord: 'border-discord/20 bg-discord/10 text-discord',
        outline: 'border-border-strong bg-transparent text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
