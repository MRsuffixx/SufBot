import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Card({
  className,
  variant = 'default',
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  variant?: 'default' | 'muted' | 'interactive' | 'premium';
}) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-surface-elevated p-[var(--card-padding)] shadow-sm',
        variant === 'muted' && 'bg-surface-secondary shadow-none',
        variant === 'interactive' &&
          'transition-[transform,border-color,box-shadow] duration-[var(--duration-normal)] hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md',
        variant === 'premium' &&
          'border-premium/25 bg-[linear-gradient(145deg,var(--surface-elevated),var(--premium-surface))]',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1.5', className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('type-card-title', className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('type-help', className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-5', className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-5 flex items-center gap-3', className)} {...props} />;
}
