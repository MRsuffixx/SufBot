import { OnboardingRepository } from '@sufbot/onboarding';
import { OnboardingSectionShell } from '@/components/onboarding-section-shell';
import { Card } from '@/components/ui/card';
import { cache, prisma } from '@/lib/runtime';

export default async function RolesPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const config = await new OnboardingRepository(prisma, cache).get(guildId);
  return (
    <OnboardingSectionShell
      guildId={guildId}
      title="Automatic roles"
      description="Role IDs are guild-bound, deduplicated, and checked against managed-role and bot-hierarchy restrictions at execution time."
      status={config.autoRoleEnabled ? 'Enabled' : 'Disabled'}
    >
      <Card>
        <p className="text-sm text-[var(--muted)]">
          Join roles: {config.autoRole.joinHumanRoleIds.length} · Verified roles:{' '}
          {config.autoRole.verifiedRoleIds.length} · Screening roles:{' '}
          {config.autoRole.screeningCompleteRoleIds.length}
        </p>
      </Card>
    </OnboardingSectionShell>
  );
}
