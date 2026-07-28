import Link from 'next/link';
import { Card } from './ui/card';

export function OnboardingSectionShell({
  guildId,
  title,
  description,
  status,
  children,
}: {
  guildId: string;
  title: string;
  description: string;
  status: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="grid gap-6">
      <Card>
        <Link
          href={`/dashboard/guilds/${guildId}/onboarding`}
          className="text-sm font-bold text-violet-600 hover:underline"
        >
          ← Member Onboarding
        </Link>
        <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black">{title}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{description}</p>
          </div>
          <span className="rounded-full bg-[var(--surface-strong)] px-3 py-1 text-xs font-bold">
            {status}
          </span>
        </div>
      </Card>
      {children}
    </div>
  );
}
