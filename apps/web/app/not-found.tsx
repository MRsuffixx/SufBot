import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-[620px] max-w-3xl place-items-center px-5 text-center">
      <div>
        <p className="text-sm font-bold uppercase tracking-[.2em] text-violet-600">404</p>
        <h1 className="mt-4 text-5xl font-black">This route left the guild.</h1>
        <p className="mt-4 text-[var(--muted)]">
          The page does not exist or is no longer available.
        </p>
        <Link href="/" className={`${buttonVariants()} mt-8`}>
          Return home
        </Link>
      </div>
    </main>
  );
}
