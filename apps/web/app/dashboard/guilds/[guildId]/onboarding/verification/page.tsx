import { OnboardingRepository } from '@sufbot/onboarding';
import { OnboardingSectionShell } from '@/components/onboarding-section-shell';
import { Card } from '@/components/ui/card';
import { cache, prisma } from '@/lib/runtime';

export default async function VerificationPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const config = await new OnboardingRepository(prisma, cache).get(guildId);
  return (
    <OnboardingSectionShell
      guildId={guildId}
      title="Verification"
      description="The bot validates channel ownership, effective permissions, role hierarchy, and stored resource IDs before setup or repair."
      status={config.resourceHealth}
    >
      <Card>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
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
            <dd className="mt-1 text-[var(--muted)]">
              {config.verifiedRoleId ?? 'Not created'}
            </dd>
          </div>
        </dl>
      </Card>
    </OnboardingSectionShell>
  );
}
