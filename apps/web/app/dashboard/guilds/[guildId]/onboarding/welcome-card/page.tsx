import { OnboardingRepository } from '@sufbot/onboarding';
import { OnboardingSectionShell } from '@/components/onboarding-section-shell';
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
      description="Bounded image dimensions, approved fonts, HTTPS-only protected asset fetching, and a message-without-card fallback."
      status={config.welcomeCardEnabled ? 'Enabled' : 'Disabled'}
    >
      <Card>
        <p className="text-sm text-[var(--muted)]">
          {config.welcomeCard.width} × {config.welcomeCard.height} · {config.welcomeCard.format} ·{' '}
          {config.welcomeCard.font}
        </p>
      </Card>
    </OnboardingSectionShell>
  );
}
