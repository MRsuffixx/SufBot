import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent text-sm font-semibold whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] duration-[var(--duration-fast)] ease-[var(--ease-standard)] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 active:translate-y-px',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover hover:text-primary-foreground',
        secondary:
          'border-border bg-surface-elevated text-foreground shadow-xs hover:border-border-strong hover:bg-surface-secondary',
        outline:
          'border-border-strong bg-transparent text-foreground hover:bg-surface-secondary',
        ghost: 'bg-transparent text-muted-foreground hover:bg-surface-secondary hover:text-foreground',
        danger: 'bg-danger text-white shadow-sm hover:bg-danger/90 hover:text-white',
        premium:
          'border-premium/30 bg-premium-surface text-premium shadow-xs hover:border-premium/50 hover:bg-premium-surface/75 hover:text-premium',
      },
      size: {
        default: 'h-[var(--control-height)] px-4',
        lg: 'h-[var(--control-height-lg)] px-5 text-[0.9375rem]',
        sm: 'h-[var(--control-height-sm)] px-3 text-xs',
        icon: 'size-[var(--control-height)]',
        'icon-sm': 'size-[var(--control-height-sm)]',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
