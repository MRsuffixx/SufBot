'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto grid min-h-[620px] max-w-3xl place-items-center px-5 text-center">
      <div>
        <h1 className="text-4xl font-black">The dashboard hit a guarded failure.</h1>
        <p className="mt-4 text-[var(--muted)]">
          No partial change was applied. Reference: {error.digest ?? 'client-error'}
        </p>
        <Button className="mt-8" onClick={reset}>Try again</Button>
      </div>
    </main>
  );
}

