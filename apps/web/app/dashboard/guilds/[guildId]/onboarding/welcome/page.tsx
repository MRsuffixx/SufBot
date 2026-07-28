import { OnboardingRepository } from '@sufbot/onboarding';
import { OnboardingSectionShell } from '@/components/onboarding-section-shell';
import { Card } from '@/components/ui/card';
import { cache, prisma } from '@/lib/runtime';

export default async function WelcomePage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const config = await new OnboardingRepository(prisma, cache).get(guildId);
  return (
    <OnboardingSectionShell
      guildId={guildId}
      title="Welcome messages"
      description="Configure audited channel and direct-message delivery with safe templates, bounded delays, and optional welcome cards."
      status={config.welcomeEnabled ? 'Enabled' : 'Disabled'}
    >
      <Card>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-bold">Channel</dt>
            <dd className="mt-1 text-[var(--muted)]">
              {config.welcome.channelId ?? 'Not selected'}
            </dd>
          </div>
          <div>
            <dt className="font-bold">Delivery</dt>
            <dd className="mt-1 text-[var(--muted)]">{config.welcome.delivery}</dd>
          </div>
          <div>
            <dt className="font-bold">Direct message</dt>
            <dd className="mt-1 text-[var(--muted)]">
              {config.welcome.dmEnabled ? 'Enabled' : 'Disabled'}
            </dd>
          </div>
          <div>
            <dt className="font-bold">Welcome card</dt>
            <dd className="mt-1 text-[var(--muted)]">
              {config.welcome.attachWelcomeCard ? 'Attached' : 'Not attached'}
            </dd>
          </div>
        </dl>
      </Card>
    </OnboardingSectionShell>
  );
}
