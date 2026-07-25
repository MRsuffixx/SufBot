import { createId } from '@sufbot/shared';
import { builtInModules } from '@sufbot/discord';
import { Card } from '@/components/ui/card';
import { ModuleForm } from '@/components/module-form';
import { prisma } from '@/lib/runtime';

export default async function ModulesPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const stored = await prisma.guildModule.findMany({ where: { guildId } });
  const byKey = new Map(stored.map((module) => [module.moduleKey, module]));
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {builtInModules.map((module) => {
        const record = byKey.get(module.metadata.key);
        const enabled = record?.enabled ?? module.metadata.key === 'general';
        return (
          <Card key={module.metadata.key}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">{module.metadata.name}</h2>
                <p className="mt-2 leading-7 text-[var(--muted)]">{module.metadata.description}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${enabled ? 'bg-emerald-500/10 text-emerald-500' : 'bg-[var(--surface-strong)] text-[var(--muted)]'}`}>
                {enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <p className="mt-6 text-xs text-[var(--muted)]">
              {module.commands.length} command(s) · cache segments {module.cacheInvalidation.segments.join(', ')}
            </p>
            <div className="mt-6">
              <ModuleForm
                guildId={guildId}
                moduleKey={module.metadata.key}
                enabled={enabled}
                version={record?.version ?? 1}
                idempotencyKey={createId('mut')}
              />
            </div>
          </Card>
        );
      })}
    </div>
  );
}

