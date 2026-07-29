import Link from 'next/link';
import { Bot } from 'lucide-react';
import { auth } from '@/auth';
import { ThemeToggle } from './theme-toggle';
import { buttonVariants } from './ui/button';

export async function SiteHeader() {
  const session = await auth();
  return (
    <header className="site-header sticky top-0 z-40 border-b border-border bg-background/88 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2.5 font-bold tracking-tight">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground shadow-md">
            <Bot size={20} />
          </span>
          SufBot
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <Link href="/features">Features</Link>
          <Link href="/commands">Commands</Link>
          <Link href="/status">Status</Link>
          <Link href="/docs">Docs</Link>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href={session?.user.id === undefined ? '/login' : '/dashboard'}
            className={buttonVariants({ size: 'sm' })}
          >
            {session?.user.id === undefined ? 'Sign in' : 'Dashboard'}
          </Link>
        </div>
      </div>
    </header>
  );
}
