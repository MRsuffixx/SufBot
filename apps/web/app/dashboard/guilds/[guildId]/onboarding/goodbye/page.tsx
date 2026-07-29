import { OnboardingDiscordResourcesSchema, OnboardingRepository } from '@sufbot/onboarding';
import { createId } from '@sufbot/shared';
import { GoodbyeMessageForm } from '@/components/onboarding-message-forms';
import { OnboardingSectionShell } from '@/components/onboarding-section-shell';
import { cache, prisma } from '@/lib/runtime';

export default async function GoodbyePage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const [config, resources] = await Promise.all([
    new OnboardingRepository(prisma, cache).get(guildId),
    cache.readRuntimeState('bot:onboarding-resources', guildId, OnboardingDiscordResourcesSchema),
  ]);
  return (
    <OnboardingSectionShell
      guildId={guildId}
      title="Goodbye messages"
      description="Use a last-known member snapshot without mass mentions or exposing sensitive history."
      status={config.goodbyeEnabled ? 'Enabled' : 'Disabled'}
    >
      <GoodbyeMessageForm
        guildId={guildId}
        version={config.version}
        idempotencyKey={createId('mut')}
        config={config.goodbye}
        channels={(resources?.channels ?? []).filter(
          (channel) => channel.canView && channel.canSend,
        )}
      />
    </OnboardingSectionShell>
  );
}
