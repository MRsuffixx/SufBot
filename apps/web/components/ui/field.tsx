import type { HTMLAttributes, LabelHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Field({
  label,
  htmlFor,
  help,
  error,
  optional,
  counter,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  help?: string;
  error?: string;
  optional?: string;
  counter?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const helpId = htmlFor === undefined ? undefined : `${htmlFor}-help`;
  const errorId = htmlFor === undefined ? undefined : `${htmlFor}-error`;
  return (
    <div className={cn('grid gap-1.5', className)}>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <label htmlFor={htmlFor} className="type-field-label">
          {label}
          {optional === undefined ? null : (
            <span className="ml-1 font-normal text-subtle-foreground">({optional})</span>
          )}
        </label>
        {counter === undefined ? null : (
          <span className="type-help tabular-nums">{counter}</span>
        )}
      </div>
      {children}
      {error === undefined ? null : (
        <p id={errorId} role="alert" className="type-help flex items-start gap-1.5 text-danger">
          {error}
        </p>
      )}
      {help === undefined ? null : (
        <p id={helpId} className="type-help">
          {help}
        </p>
      )}
    </div>
  );
}

export function FieldLabel({
  className,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('type-field-label', className)} {...props} />;
}

export function FieldHelp({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('type-help', className)} {...props} />;
}
