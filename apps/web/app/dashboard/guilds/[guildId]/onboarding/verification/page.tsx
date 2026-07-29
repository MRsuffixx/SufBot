import { OnboardingDiscordResourcesSchema, OnboardingRepository } from '@sufbot/onboarding';
import { createId } from '@sufbot/shared';
import { OnboardingSectionShell } from '@/components/onboarding-section-shell';
import { Card } from '@/components/ui/card';
import { VerificationSetupForm } from '@/components/verification-setup-form';
import { cache, prisma } from '@/lib/runtime';

export default async function VerificationPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const [config, resources] = await Promise.all([
    new OnboardingRepository(prisma, cache).get(guildId),
    cache.readRuntimeState('bot:onboarding-resources', guildId, OnboardingDiscordResourcesSchema),
  ]);
  return (
    <OnboardingSectionShell
      guildId={guildId}
      title="Verification setup"
      description="Create or select guild resources, preview the permission plan, repair broken resources, and migrate existing members through an audited background operation."
      status={config.resourceHealth}
    >
      <Card>
        <dl className="mb-6 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="font-bold">Mode</dt>
            <dd className="mt-1 text-[var(--muted)]">{config.setupMode}</dd>
          </div>
          <div>
            <dt className="font-bold">Captcha</dt>
            <dd className="mt-1 text-[var(--muted)]">{config.captchaType}</dd>
          </div>
          <div>
            <dt className="font-bold">Channel</dt>
            <dd className="mt-1 text-[var(--muted)]">
              {config.verificationChannelId ?? 'Not created'}
            </dd>
          </div>
          <div>
            <dt className="font-bold">Verified role</dt>
            <dd className="mt-1 text-[var(--muted)]">{config.verifiedRoleId ?? 'Not created'}</dd>
          </div>
        </dl>
        <VerificationSetupForm
          guildId={guildId}
          config={config}
          resources={resources}
          idempotencyKey={createId('mut')}
        />
      </Card>
    </OnboardingSectionShell>
  );
}
