import type { HTMLAttributes, ReactNode } from 'react';
import { AlertTriangle, Crown, Inbox, LoaderCircle, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function PageContainer({
  width = 'default',
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  width?: 'narrow' | 'default' | 'wide' | 'full';
}) {
  return (
    <div
      className={cn(
        'mx-auto w-full',
        width === 'narrow' && 'max-w-3xl',
        width === 'default' && 'max-w-6xl',
        width === 'wide' && 'max-w-[1500px]',
        width === 'full' && 'max-w-none',
        className,
      )}
      {...props}
    />
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  status,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  status?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mb-6 flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow === undefined ? null : (
          <p className="mb-2 text-[11px] font-bold tracking-[0.14em] text-primary uppercase">
            {eyebrow}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="type-page-title">{title}</h1>
          {status}
        </div>
        {description === undefined ? null : (
          <p className="type-page-subtitle mt-2 max-w-3xl">{description}</p>
        )}
      </div>
      {actions === undefined ? null : (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

export function SectionHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div>
        <h2 className="type-section-title">{title}</h2>
        {description === undefined ? null : <p className="type-help mt-1">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function SettingsSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'grid gap-4 border-b border-border py-6 last:border-b-0 lg:grid-cols-[minmax(180px,260px)_minmax(0,1fr)]',
        className,
      )}
    >
      <div>
        <h2 className="type-section-title">{title}</h2>
        {description === undefined ? null : <p className="type-help mt-1.5">{description}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function SettingsCard({
  title,
  description,
  children,
  footer,
  className,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      {title === undefined ? null : (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description === undefined ? null : <CardDescription>{description}</CardDescription>}
        </CardHeader>
      )}
      <div className={title === undefined ? '' : 'mt-5'}>{children}</div>
      {footer === undefined ? null : (
        <div className="mt-5 border-t border-border pt-4">{footer}</div>
      )}
    </Card>
  );
}

export function ModuleCard({
  title,
  description,
  enabled,
  premium,
  icon,
  children,
  className,
}: {
  title: string;
  description: string;
  enabled: boolean;
  premium?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Card variant="interactive" className={className}>
      <div className="flex items-start gap-3">
        {icon === undefined ? null : (
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="type-section-title">{title}</h2>
            <Badge variant={enabled ? 'success' : 'neutral'}>
              {enabled ? 'Enabled' : 'Disabled'}
            </Badge>
            {premium ? <Badge variant="premium">Premium</Badge> : null}
          </div>
          <p className="type-help mt-1.5">{description}</p>
        </div>
      </div>
      {children === undefined ? null : <div className="mt-5">{children}</div>}
    </Card>
  );
}

export function StatCard({
  label,
  value,
  detail,
  icon,
  trend,
  className,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  trend?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('min-w-0', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        {icon === undefined ? null : (
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-surface-secondary text-primary">
            {icon}
          </span>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-x-3 gap-y-1">
        <p className="text-2xl font-bold tracking-[-0.03em]">{value}</p>
        {trend}
      </div>
      {detail === undefined ? null : <p className="type-help mt-1.5">{detail}</p>}
    </Card>
  );
}

export const MetricCard = StatCard;
export const StatusCard = StatCard;
export const FeatureCard = SettingsCard;

export function StatusBadge({
  status,
  children,
}: {
  status: NonNullable<BadgeProps['variant']>;
  children: ReactNode;
}) {
  return <Badge variant={status}>{children}</Badge>;
}

export function EmptyState({
  title,
  description,
  action,
  icon = <Inbox size={22} />,
  className,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid min-h-52 place-items-center rounded-lg border border-dashed border-border-strong bg-surface-secondary/55 p-6 text-center',
        className,
      )}
    >
      <div className="max-w-md">
        <span className="mx-auto grid size-11 place-items-center rounded-lg bg-surface-elevated text-muted-foreground shadow-xs">
          {icon}
        </span>
        <h3 className="mt-4 text-sm font-semibold">{title}</h3>
        <p className="type-help mt-1.5">{description}</p>
        {action === undefined ? null : <div className="mt-4 flex justify-center">{action}</div>}
      </div>
    </div>
  );
}

export function ErrorState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <EmptyState
      title={title}
      description={description}
      action={action}
      icon={<AlertTriangle size={22} />}
      className={cn('border-danger/35 bg-danger-surface/45', className)}
    />
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-36 items-center justify-center gap-2 text-sm text-muted-foreground">
      <LoaderCircle size={18} className="animate-spin motion-reduce:animate-none" />
      <span>{label}</span>
    </div>
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <Card aria-hidden="true">
      <div className="h-4 w-2/5 animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />
      <div className="mt-5 grid gap-2.5">
        {Array.from({ length: lines }, (_, index) => (
          <div
            key={index}
            className="h-3 animate-pulse rounded bg-surface-secondary motion-reduce:animate-none"
            style={{ width: `${92 - index * 11}%` }}
          />
        ))}
      </div>
    </Card>
  );
}

export function PermissionWarning({
  title,
  description,
  actionHref,
  actionLabel,
}: {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-warning/30 bg-warning-surface p-4 text-warning sm:flex-row sm:items-center">
      <ShieldAlert size={20} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-xs leading-5 text-warning/85">{description}</p>
      </div>
      {actionHref === undefined || actionLabel === undefined ? null : (
        <a href={actionHref} className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
          {actionLabel}
        </a>
      )}
    </div>
  );
}

export function PremiumLock({
  title,
  description,
  action,
  compact = false,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border border-premium/30 bg-premium-surface p-5 text-premium',
        compact && 'p-3',
      )}
    >
      <div className="flex items-start gap-3">
        <Crown size={compact ? 17 : 21} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-xs leading-5 text-premium/85">{description}</p>
          {action === undefined ? null : <div className="mt-3">{action}</div>}
        </div>
      </div>
    </div>
  );
}

export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn('grid gap-4 rounded-lg border border-border p-4', className)}>
      <legend className="px-1.5 text-sm font-semibold">{title}</legend>
      {description === undefined ? null : <p className="type-help -mt-2">{description}</p>}
      {children}
    </fieldset>
  );
}

export function SplitPane({
  editor,
  preview,
  className,
}: {
  editor: ReactNode;
  preview: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.82fr)]', className)}>
      <div className="min-w-0">{editor}</div>
      <div className="min-w-0">{preview}</div>
    </div>
  );
}

export function PreviewPane({ children, className }: HTMLAttributes<HTMLDivElement>) {
  return (
    <aside
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-sm xl:sticky xl:top-[calc(var(--header-height)+1.25rem)]',
        className,
      )}
    >
      {children}
    </aside>
  );
}

export function BuilderToolbar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex min-h-12 flex-wrap items-center gap-2 border-b border-border bg-surface-secondary px-3 py-2',
        className,
      )}
      {...props}
    />
  );
}

export function FilterBar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-lg border border-border bg-surface-elevated p-3 sm:flex-row sm:items-center',
        className,
      )}
      {...props}
    />
  );
}

export function MobileBottomActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'fixed right-0 bottom-0 left-0 z-[var(--z-sticky)] flex items-center gap-2 border-t border-border bg-surface-elevated/95 p-3 backdrop-blur lg:hidden',
        className,
      )}
      {...props}
    />
  );
}
