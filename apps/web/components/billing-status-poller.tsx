'use client';

import { useEffect, useState } from 'react';

type CheckoutStatus = {
  state: string;
  subscriptionStatus?: string;
  guildId?: string;
};

const terminal = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED']);

export function BillingStatusPoller() {
  const [status, setStatus] = useState<CheckoutStatus>({ state: 'CONFIRMING' });
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (terminal.has(status.state) || attempts >= 40) return;
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => {
        fetch('/api/billing/checkout-status', {
          cache: 'no-store',
          credentials: 'same-origin',
          signal: controller.signal,
        })
          .then(async (response) => {
            const body = (await response.json()) as CheckoutStatus;
            setStatus(body);
            setAttempts((value) => value + 1);
          })
          .catch(() => setAttempts((value) => value + 1));
      },
      attempts === 0 ? 0 : 3_000,
    );
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [attempts, status.state]);

  const view =
    status.state === 'COMPLETED' && status.subscriptionStatus === 'ACTIVE'
      ? {
          title: 'Premium activated',
          message: 'A verified provider event activated Premium for the selected guild.',
        }
      : status.state === 'FAILED' || status.state === 'CANCELLED'
        ? {
            title: 'Payment was not completed',
            message: 'Premium was not activated. No browser redirect can grant access.',
          }
        : status.state === 'EXPIRED'
          ? {
              title: 'Checkout expired',
              message: 'Start a new checkout from the guild Premium page.',
            }
          : attempts >= 40
            ? {
                title: 'Still processing',
                message:
                  'Confirmation is taking longer than expected. The provider will be reconciled server-side.',
              }
            : {
                title: 'Payment is being confirmed',
                message:
                  'We are waiting for a signed provider event. You may safely leave this page.',
              };

  return (
    <div aria-live="polite">
      <h1 className="text-3xl font-black tracking-tight">{view.title}</h1>
      <p className="mt-3 text-[var(--muted)]">{view.message}</p>
      {status.guildId !== undefined ? (
        <a
          className="mt-6 inline-block font-semibold text-violet-600"
          href={`/dashboard/guilds/${status.guildId}/premium`}
        >
          Open guild billing
        </a>
      ) : null}
    </div>
  );
}
