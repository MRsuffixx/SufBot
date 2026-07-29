import { OnboardingRepository } from '@sufbot/onboarding';
import { createId } from '@sufbot/shared';
import { OnboardingSectionShell } from '@/components/onboarding-section-shell';
import { WelcomeCardForm } from '@/components/welcome-card-form';
import { Card } from '@/components/ui/card';
import { cache, entitlements, prisma } from '@/lib/runtime';

export default async function WelcomeCardPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const [config, plan] = await Promise.all([
    new OnboardingRepository(prisma, cache).get(guildId),
    entitlements.getGuildLimits(guildId),
  ]);
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
          customBackgroundLimit={plan.limits.customCardBackgrounds}
          tier={plan.tier}
        />
      </Card>
    </OnboardingSectionShell>
  );
}
