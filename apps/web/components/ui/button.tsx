import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-violet-600 px-4 py-2.5 text-white shadow-lg shadow-violet-600/20 hover:bg-violet-500',
        secondary:
          'border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 hover:bg-[var(--surface-strong)]',
        ghost: 'px-3 py-2 hover:bg-[var(--surface)]',
        danger: 'bg-red-600 px-4 py-2.5 text-white hover:bg-red-500',
      },
      size: {
        default: 'h-10',
        lg: 'h-12 px-6 text-base',
        sm: 'h-8 px-3 text-xs',
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
