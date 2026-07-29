import { OnboardingDiscordResourcesSchema, OnboardingRepository } from '@sufbot/onboarding';
import { createId } from '@sufbot/shared';
import { OnboardingSectionShell } from '@/components/onboarding-section-shell';
import { WelcomeMessageForm } from '@/components/onboarding-message-forms';
import { cache, prisma } from '@/lib/runtime';

export default async function WelcomePage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const [config, resources] = await Promise.all([
    new OnboardingRepository(prisma, cache).get(guildId),
    cache.readRuntimeState('bot:onboarding-resources', guildId, OnboardingDiscordResourcesSchema),
  ]);
  return (
    <OnboardingSectionShell
      guildId={guildId}
      title="Welcome messages"
      description="Configure audited channel and direct-message delivery with safe templates, bounded delays, and optional welcome cards."
      status={config.welcomeEnabled ? 'Enabled' : 'Disabled'}
    >
      <WelcomeMessageForm
        guildId={guildId}
        version={config.version}
        idempotencyKey={createId('mut')}
        config={config.welcome}
        channels={(resources?.channels ?? []).filter(
          (channel) => channel.canView && channel.canSend,
        )}
      />
    </OnboardingSectionShell>
  );
}
