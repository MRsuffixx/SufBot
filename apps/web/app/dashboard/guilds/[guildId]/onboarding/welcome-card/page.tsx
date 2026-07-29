import { OnboardingRepository } from '@sufbot/onboarding';
import { createId } from '@sufbot/shared';
import { OnboardingSectionShell } from '@/components/onboarding-section-shell';
import { WelcomeCardForm } from '@/components/welcome-card-form';
import { Card } from '@/components/ui/card';
import { cache, prisma } from '@/lib/runtime';

export default async function WelcomeCardPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const config = await new OnboardingRepository(prisma, cache).get(guildId);
  return (
    <OnboardingSectionShell
      guildId={guildId}
      title="Welcome card"
      description="Configure a bounded worker-rendered card with approved fonts and protected remote assets."
      status={config.welcomeCardEnabled ? 'Enabled' : 'Disabled'}
    >
      <Card>
        <WelcomeCardForm
          guildId={guildId}
          version={config.version}
          idempotencyKey={createId('mut')}
          config={config.welcomeCard}
        />
      </Card>
    </OnboardingSectionShell>
  );
}
