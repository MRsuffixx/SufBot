import Link from 'next/link';
import { LockKeyhole } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';

export default function UnauthorizedPage() {
  return (
    <main className="mx-auto grid min-h-[620px] max-w-3xl place-items-center px-5 text-center">
      <div>
        <LockKeyhole className="mx-auto text-violet-600" size={48} />
        <h1 className="mt-7 text-4xl font-black">That guild is outside your access.</h1>
        <p className="mt-4 text-[var(--muted)]">
          Ownership or Manage Server permission is required. Refresh Discord permissions and try
          again.
        </p>
        <Link href="/dashboard/guilds" className={`${buttonVariants()} mt-8`}>
          Back to guilds
        </Link>
      </div>
    </main>
  );
}
