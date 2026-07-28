import Link from 'next/link';
import { createId } from '@sufbot/shared';
import { OnboardingRepository } from '@sufbot/onboarding';
import { Card } from '@/components/ui/card';
import { OnboardingBasicsForm } from '@/components/onboarding-basics-form';
import { cache, prisma } from '@/lib/runtime';

const sections = [
  ['welcome', 'Welcome', 'Channel and direct-message delivery'],
  ['goodbye', 'Goodbye', 'Safe member-departure messages'],
  ['verification', 'Verification', 'Panel, captcha, and resource health'],
  ['roles', 'Roles', 'Join, verified, and screening-complete roles'],
  ['welcome-card', 'Welcome card', 'Image layout and secure assets'],
  ['logs', 'Logs', 'Onboarding events and failures'],
] as const;

export default async function OnboardingPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const config = await new OnboardingRepository(prisma, cache).get(guildId);
  return (
    <div className="grid gap-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[.16em] text-violet-600">
              Member Onboarding
            </p>
            <h2 className="mt-2 text-2xl font-black">Guild-isolated onboarding controls</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
              Changes are version checked, audited, committed before cache invalidation, and loaded
              by every bot process from the durable guild configuration.
            </p>
          </div>
          <span className="rounded-full bg-[var(--surface-strong)] px-3 py-1 text-xs font-bold">
            Setup: {config.resourceHealth.toLowerCase().replaceAll('_', ' ')}
          </span>
        </div>
        <div className="mt-7">
          <OnboardingBasicsForm
            guildId={guildId}
            version={config.version}
            idempotencyKey={createId('mut')}
            values={{
              welcomeEnabled: config.welcomeEnabled,
              goodbyeEnabled: config.goodbyeEnabled,
              verificationEnabled: config.verificationEnabled,
              autoRoleEnabled: config.autoRoleEnabled,
              welcomeCardEnabled: config.welcomeCardEnabled,
            }}
          />
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sections.map(([path, title, description]) => (
          <Link key={path} href={`/dashboard/guilds/${guildId}/onboarding/${path}`}>
            <Card className="h-full transition hover:-translate-y-0.5 hover:border-violet-500/50">
              <h3 className="font-bold">{title}</h3>
              <p className="mt-2 text-sm text-[var(--muted)]">{description}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
