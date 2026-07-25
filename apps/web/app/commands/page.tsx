import { builtInModules } from '@sufbot/discord';
import { Card } from '@/components/ui/card';

export default function CommandsPage() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-20">
      <h1 className="text-5xl font-black tracking-tight">Command directory</h1>
      <p className="mt-5 max-w-2xl text-lg text-[var(--muted)]">
        A compact, complete example set that exercises the same policy and module system future
        commands will use.
      </p>
      <div className="mt-12 grid gap-6">
        {builtInModules.map((module) => (
          <Card key={module.metadata.key}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">{module.metadata.name}</h2>
                <p className="mt-2 text-[var(--muted)]">{module.metadata.description}</p>
              </div>
              <span className="rounded-full border px-3 py-1 text-xs font-semibold">
                v{module.metadata.version}
              </span>
            </div>
            <div className="mt-7 divide-y">
              {module.commands.map((command) => (
                <div key={command.name} className="grid gap-2 py-4 sm:grid-cols-[180px_1fr_auto]">
                  <code className="font-bold text-violet-600">/{command.name}</code>
                  <span className="text-sm text-[var(--muted)]">{command.description}</span>
                  <span className="text-xs text-[var(--muted)]">
                    {command.guildOnly ? 'Server only' : 'Everywhere'}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </main>
  );
}
