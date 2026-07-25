import Link from 'next/link';

export function GuildNav({ guildId }: { guildId: string }) {
  const routes = [
    ['', 'Overview'],
    ['/settings', 'Settings'],
    ['/modules', 'Modules'],
    ['/commands', 'Command access'],
    ['/audit-logs', 'Audit logs'],
  ] as const;
  return (
    <nav className="flex gap-2 overflow-x-auto border-b pb-3 text-sm">
      {routes.map(([path, label]) => (
        <Link
          key={path}
          href={`/dashboard/guilds/${guildId}${path}`}
          className="whitespace-nowrap rounded-lg px-3 py-2 font-semibold hover:bg-[var(--surface-strong)]"
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
