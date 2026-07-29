import { OnboardingRepository } from '@sufbot/onboarding';
import { createId } from '@sufbot/shared';
import { OnboardingRoleForm } from '@/components/onboarding-role-form';
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
        <OnboardingRoleForm
          guildId={guildId}
          version={config.version}
          idempotencyKey={createId('mut')}
          config={config.autoRole}
        />
      </Card>
    </OnboardingSectionShell>
  );
}
