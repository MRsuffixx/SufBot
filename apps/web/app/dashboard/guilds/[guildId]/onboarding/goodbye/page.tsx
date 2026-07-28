import { OnboardingRepository } from '@sufbot/onboarding';
import { OnboardingSectionShell } from '@/components/onboarding-section-shell';
import { Card } from '@/components/ui/card';
import { cache, prisma } from '@/lib/runtime';

export default async function GoodbyePage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const config = await new OnboardingRepository(prisma, cache).get(guildId);
  return (
    <OnboardingSectionShell
      guildId={guildId}
      title="Goodbye messages"
      description="Use a last-known member snapshot without mass mentions or exposing sensitive history."
      status={config.goodbyeEnabled ? 'Enabled' : 'Disabled'}
    >
      <Card>
        <p className="text-sm text-[var(--muted)]">
          Target channel: {config.goodbye.channelId ?? 'Not selected'} · Delay:{' '}
          {config.goodbye.delaySeconds}s
        </p>
      </Card>
    </OnboardingSectionShell>
  );
}
