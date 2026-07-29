import * as React from 'react';
import { cn } from '@/lib/utils';
import { controlClassName } from './input';

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        controlClassName,
        'appearance-none bg-[linear-gradient(45deg,transparent_50%,var(--text-muted)_50%),linear-gradient(135deg,var(--text-muted)_50%,transparent_50%)] bg-[position:calc(100%-15px)_50%,calc(100%-10px)_50%] bg-[size:5px_5px,5px_5px] bg-no-repeat pr-9',
        props.multiple && 'h-auto min-h-28 bg-none py-2 pr-3',
        className,
      )}
      {...props}
    />
  );
}
