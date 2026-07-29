import { createId } from '@sufbot/shared';
import { CheckCircle2, Languages, RadioTower, ShieldCheck } from 'lucide-react';
import {
  PageHeader,
  SettingsCard,
  SettingsSection,
} from '@/components/dashboard/page-primitives';
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
    <>
      <PageHeader
        eyebrow="Server management"
        title="Server settings"
        description="Core preferences shared by every SufBot module in this Discord server."
      />
      <SettingsSection
        title="General preferences"
        description="Language, time, and compatibility defaults."
      >
        <SettingsCard>
          <GuildSettingsForm
            guildId={guildId}
            locale={settings.locale}
            timezone={settings.timezone}
            commandPrefix={settings.commandPrefix}
            version={settings.version}
            idempotencyKey={createId('mut')}
          />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection
        title="Safe change pipeline"
        description="Every settings update follows the same guarded path."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            [CheckCircle2, 'Validate', 'Form values and version are validated before mutation.'],
            [ShieldCheck, 'Authorize', 'Discord authority is refreshed for the acting user.'],
            [RadioTower, 'Commit', 'Settings and audit records commit in one transaction.'],
            [Languages, 'Synchronize', 'Local and Redis caches receive a versioned event.'],
          ].map(([Icon, title, description]) => (
            <SettingsCard key={String(title)} className="p-4">
              <Icon size={17} className="text-primary" />
              <h3 className="mt-3 text-sm font-semibold">{String(title)}</h3>
              <p className="type-help mt-1">{String(description)}</p>
            </SettingsCard>
          ))}
        </div>
      </SettingsSection>
    </>
  );
}
