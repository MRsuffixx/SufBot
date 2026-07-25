import { createId } from '@sufbot/shared';
import { Card } from '@/components/ui/card';
import { GuildSettingsForm } from '@/components/guild-settings-form';
import { prisma } from '@/lib/runtime';

export default async function GuildSettingsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const settings = await prisma.guildSettings.upsert({
    where: { guildId },
    create: { guildId },
    update: {},
  });
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card>
        <h2 className="text-xl font-bold">Guild settings</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Optimistic concurrency prevents one administrator from silently overwriting another.
        </p>
        <div className="mt-7">
          <GuildSettingsForm
            guildId={guildId}
            locale={settings.locale}
            timezone={settings.timezone}
            commandPrefix={settings.commandPrefix}
            version={settings.version}
            idempotencyKey={createId('mut')}
          />
        </div>
      </Card>
      <Card>
        <h3 className="font-bold">Change pipeline</h3>
        <ol className="mt-4 grid gap-3 text-sm text-[var(--muted)]">
          <li>1. Validate form values.</li>
          <li>2. Refresh Discord authority.</li>
          <li>3. Commit settings and audit in one transaction.</li>
          <li>4. Invalidate local and Redis caches.</li>
          <li>5. Publish a versioned event.</li>
        </ol>
      </Card>
    </div>
  );
}
