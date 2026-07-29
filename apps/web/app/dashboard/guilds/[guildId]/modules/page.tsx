import { createId } from '@sufbot/shared';
import { builtInModules } from '@sufbot/discord';
import { Blocks, Command, DatabaseZap } from 'lucide-react';
import { ModuleCard, PageHeader } from '@/components/dashboard/page-primitives';
import { ModuleForm } from '@/components/module-form';
import { Badge } from '@/components/ui/badge';
import { prisma } from '@/lib/runtime';

export default async function ModulesPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const stored = await prisma.guildModule.findMany({ where: { guildId } });
  const byKey = new Map(stored.map((module) => [module.moduleKey, module]));
  const enabledCount = builtInModules.filter((module) => {
    const record = byKey.get(module.metadata.key);
    return record?.enabled ?? module.metadata.key === 'general';
  }).length;
  return (
    <>
      <PageHeader
        eyebrow="Server management"
        title="Modules"
        description="Enable only the capabilities this server needs. Module changes remain versioned, permission-aware, and audited."
        status={<Badge variant="success">{enabledCount} enabled</Badge>}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {builtInModules.map((module) => {
          const record = byKey.get(module.metadata.key);
          const enabled = record?.enabled ?? module.metadata.key === 'general';
          return (
            <ModuleCard
              key={module.metadata.key}
              icon={<Blocks size={18} />}
              title={module.metadata.name}
              description={module.metadata.description}
              enabled={enabled}
            >
              <div className="mb-5 flex flex-wrap gap-2">
                <Badge variant="outline">
                  <Command size={11} /> {module.commands.length} commands
                </Badge>
                <Badge variant="outline">
                  <DatabaseZap size={11} /> {module.cacheInvalidation.segments.length} cache segments
                </Badge>
                <Badge variant="outline">Version {record?.version ?? 1}</Badge>
              </div>
              <ModuleForm
                guildId={guildId}
                moduleKey={module.metadata.key}
                enabled={enabled}
                version={record?.version ?? 1}
                idempotencyKey={createId('mut')}
              />
            </ModuleCard>
          );
        })}
      </div>
    </>
  );
}
