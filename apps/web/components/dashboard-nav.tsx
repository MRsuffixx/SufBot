import Link from 'next/link';
import { Bot, LayoutDashboard, Server, UserRound } from 'lucide-react';
import type { Session } from 'next-auth';

export function DashboardNav({ session }: { session: Session }) {
  return (
    <aside className="border-r border-[var(--border)] bg-[color:var(--surface)/.82] p-4 max-[900px]:border-b max-[900px]:border-r-0">
      <div className="sticky top-20">
        <div className="mb-6 flex items-center gap-3 rounded-xl border bg-[var(--background)] p-3">
          <span className="grid size-9 place-items-center rounded-lg bg-violet-600 text-white">
            <Bot size={18} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{session.user.name ?? 'Discord admin'}</p>
            <p className="truncate text-xs text-[var(--muted)]">{session.user.platformRole}</p>
          </div>
        </div>
        <nav className="grid gap-1 text-sm max-[900px]:grid-cols-3">
          <DashboardLink href="/dashboard" icon={LayoutDashboard}>
            Overview
          </DashboardLink>
          <DashboardLink href="/dashboard/guilds" icon={Server}>
            Guilds
          </DashboardLink>
          <DashboardLink href="/dashboard/profile" icon={UserRound}>
            Profile
          </DashboardLink>
        </nav>
      </div>
    </aside>
  );
}

function DashboardLink({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: typeof Server;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium hover:bg-[var(--surface-strong)]"
    >
      <Icon size={17} />
      <span>{children}</span>
    </Link>
  );
}
