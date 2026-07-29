'use client';

import { useActionState, useEffect, useRef, type RefObject } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/app/actions/guild';
import { Button } from './ui/button';
import { useDashboardI18n } from './dashboard/dashboard-i18n';
import { useUnsavedChanges, useUnsavedForm } from './dashboard/unsaved-changes';

const initialState: ActionState = { status: 'idle', message: '' };

function SubmitButton({
  label,
  formRef,
}: {
  label: string;
  formRef: RefObject<HTMLFormElement | null>;
}) {
  const { pending } = useFormStatus();
  const { t } = useDashboardI18n();
  const { setPending } = useUnsavedChanges();

  useEffect(() => {
    if (formRef.current !== null) setPending(formRef.current, pending);
  }, [formRef, pending, setPending]);

  return (
    <Button type="submit" disabled={pending}>
      {pending ? t('save.saving') : label}
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
  const formRef = useRef<HTMLFormElement>(null);
  const { clear } = useUnsavedChanges();
  const formEvents = useUnsavedForm(formRef);

  useEffect(() => {
    if (state.status === 'success' && formRef.current !== null) {
      clear(formRef.current, true);
    }
  }, [clear, state.status]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className={className}
      onChange={formEvents.onChange}
      onReset={formEvents.onReset}
    >
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label={submitLabel} formRef={formRef} />
        {state.status !== 'idle' ? (
          <p
            role="status"
            className={state.status === 'error' ? 'text-sm text-danger' : 'text-sm text-success'}
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
