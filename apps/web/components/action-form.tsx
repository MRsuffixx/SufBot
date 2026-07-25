'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/app/actions/guild';
import { Button } from './ui/button';

const initialState: ActionState = { status: 'idle', message: '' };

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : label}
    </Button>
  );
}

export function ActionForm({
  action,
  children,
  submitLabel,
  className,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  submitLabel: string;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, initialState);
  return (
    <form action={formAction} className={className}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label={submitLabel} />
        {state.status !== 'idle' ? (
          <p
            role="status"
            className={
              state.status === 'error' ? 'text-sm text-red-500' : 'text-sm text-emerald-500'
            }
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
