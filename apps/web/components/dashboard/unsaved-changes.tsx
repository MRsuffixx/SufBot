'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { Check, RotateCcw, Save, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDashboardI18n } from './dashboard-i18n';

type UnsavedChangesValue = {
  dirty: boolean;
  pending: boolean;
  valid: boolean;
  markDirty: (form: HTMLFormElement) => void;
  clear: (form: HTMLFormElement, saved?: boolean) => void;
  setPending: (form: HTMLFormElement, pending: boolean) => void;
  setValid: (form: HTMLFormElement, valid: boolean) => void;
};

const UnsavedChangesContext = createContext<UnsavedChangesValue | null>(null);

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [activeForm, setActiveForm] = useState<HTMLFormElement | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, setPendingState] = useState(false);
  const [valid, setValidState] = useState(true);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markDirty = useCallback((form: HTMLFormElement) => {
    setActiveForm(form);
    setDirty(true);
    setSaved(false);
    setValidState(form.checkValidity());
  }, []);

  const clear = useCallback((form: HTMLFormElement, wasSaved = false) => {
    setActiveForm((current) => (current === form ? null : current));
    setDirty(false);
    setPendingState(false);
    setValidState(true);
    if (wasSaved) {
      setSaved(true);
      if (savedTimer.current !== null) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 2200);
    }
  }, []);

  const setPending = useCallback((form: HTMLFormElement, nextPending: boolean) => {
    setActiveForm((current) => current ?? form);
    setPendingState(nextPending);
  }, []);

  const setValid = useCallback((form: HTMLFormElement, nextValid: boolean) => {
    setActiveForm((current) => current ?? form);
    setValidState(nextValid);
  }, []);

  const save = useCallback(() => {
    if (activeForm === null || pending) return;
    const formValid = activeForm.reportValidity();
    setValidState(formValid);
    if (formValid) activeForm.requestSubmit();
  }, [activeForm, pending]);

  const revert = useCallback(() => {
    if (activeForm === null || pending) return;
    activeForm.reset();
    clear(activeForm);
  }, [activeForm, clear, pending]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    const keyDown = (event: KeyboardEvent) => {
      if (!dirty || event.key.toLowerCase() !== 's' || (!event.ctrlKey && !event.metaKey)) return;
      event.preventDefault();
      save();
    };
    const click = (event: MouseEvent) => {
      if (!dirty || pending || !(event.target instanceof Element)) return;
      const anchor = event.target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank') return;
      const destination = new URL(anchor.href, window.location.href);
      if (
        destination.origin !== window.location.origin ||
        destination.pathname === window.location.pathname
      ) {
        return;
      }
      if (!window.confirm('You have unsaved changes. Leave this page and discard them?')) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('keydown', keyDown);
    document.addEventListener('click', click, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('keydown', keyDown);
      document.removeEventListener('click', click, true);
    };
  }, [dirty, pending, save]);

  useEffect(
    () => () => {
      if (savedTimer.current !== null) clearTimeout(savedTimer.current);
    },
    [],
  );

  const value = useMemo<UnsavedChangesValue>(
    () => ({ dirty, pending, valid, markDirty, clear, setPending, setValid }),
    [clear, dirty, markDirty, pending, setPending, setValid, valid],
  );

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
      <UnsavedChangesBar
        dirty={dirty}
        pending={pending}
        valid={valid}
        saved={saved}
        onSave={save}
        onRevert={revert}
      />
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChanges(): UnsavedChangesValue {
  const context = useContext(UnsavedChangesContext);
  if (context === null) {
    throw new Error('useUnsavedChanges must be used within UnsavedChangesProvider.');
  }
  return context;
}

export function useUnsavedForm(formRef: RefObject<HTMLFormElement | null>) {
  const context = useUnsavedChanges();

  const onChange = useCallback(() => {
    if (formRef.current !== null) context.markDirty(formRef.current);
  }, [context, formRef]);

  const onReset = useCallback(() => {
    if (formRef.current !== null) context.clear(formRef.current);
  }, [context, formRef]);

  return { onChange, onReset };
}

function UnsavedChangesBar({
  dirty,
  pending,
  valid,
  saved,
  onSave,
  onRevert,
}: {
  dirty: boolean;
  pending: boolean;
  valid: boolean;
  saved: boolean;
  onSave: () => void;
  onRevert: () => void;
}) {
  const { t } = useDashboardI18n();
  if (!dirty && !saved) return null;

  return (
    <div
      className="fixed right-3 bottom-3 left-3 z-[var(--z-toast)] md:left-[calc(var(--sidebar-current-width)+1.5rem)]"
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 rounded-lg border border-border-strong bg-surface-elevated p-3 shadow-lg">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`grid size-9 shrink-0 place-items-center rounded-md ${
              saved
                ? 'bg-success-surface text-success'
                : valid
                  ? 'bg-primary/10 text-primary'
                  : 'bg-danger-surface text-danger'
            }`}
          >
            {saved ? <Check size={18} /> : valid ? <Save size={17} /> : <TriangleAlert size={18} />}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{saved ? t('save.saved') : t('save.detected')}</p>
            {!saved ? (
              <p className={`type-help ${valid ? '' : 'text-danger'}`}>
                {valid ? t('save.description') : t('save.invalid')}
              </p>
            ) : null}
          </div>
        </div>
        {!saved ? (
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onRevert}>
              <RotateCcw size={14} /> {t('save.revert')}
            </Button>
            <Button type="button" size="sm" disabled={pending || !valid} onClick={onSave}>
              <Save size={14} /> {pending ? t('save.saving') : t('save.save')}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
