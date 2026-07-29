import Link from 'next/link';
import { createId } from '@sufbot/shared';
import { OnboardingRepository } from '@sufbot/onboarding';
import {
  FileClock,
  ImageIcon,
  LogOut,
  ShieldCheck,
  Sparkles,
  UserRoundPlus,
} from 'lucide-react';
import {
  ModuleCard,
  PageHeader,
  SettingsCard,
  SectionHeader,
} from '@/components/dashboard/page-primitives';
import { Badge } from '@/components/ui/badge';
import { OnboardingBasicsForm } from '@/components/onboarding-basics-form';
import { cache, prisma } from '@/lib/runtime';

const sections = [
  {
    path: 'welcome',
    title: 'Welcome',
    description: 'Channel and direct-message delivery with the reusable message builder.',
    icon: Sparkles,
    flag: 'welcomeEnabled',
  },
  {
    path: 'goodbye',
    title: 'Goodbye',
    description: 'Safe member-departure messages from bounded snapshots.',
    icon: LogOut,
    flag: 'goodbyeEnabled',
  },
  {
    path: 'verification',
    title: 'Verification',
    description: 'Panel, captcha, Discord resources, and permission health.',
    icon: ShieldCheck,
    flag: 'verificationEnabled',
  },
  {
    path: 'roles',
    title: 'Automatic roles',
    description: 'Join, verified, and screening-complete role assignments.',
    icon: UserRoundPlus,
    flag: 'autoRoleEnabled',
  },
  {
    path: 'welcome-card',
    title: 'Welcome card',
    description: 'Generated image layout, branding, and secure remote assets.',
    icon: ImageIcon,
    flag: 'welcomeCardEnabled',
  },
  {
    path: 'logs',
    title: 'Onboarding logs',
    description: 'Recent lifecycle events, warnings, and delivery failures.',
    icon: FileClock,
    flag: null,
  },
] as const;

export default async function OnboardingPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const config = await new OnboardingRepository(prisma, cache).get(guildId);
  const enabledCount = sections.filter(
    (section) => section.flag !== null && config[section.flag],
  ).length;
  return (
    <>
      <PageHeader
        eyebrow="Member lifecycle"
        title="Onboarding"
        description="Coordinate welcome, verification, automatic roles, and member departure from one modular workspace."
        status={
          <Badge variant={config.resourceHealth === 'HEALTHY' ? 'success' : 'warning'}>
            {config.resourceHealth.toLowerCase().replaceAll('_', ' ')}
          </Badge>
        }
      />
      <SettingsCard>
        <SectionHeader
          title="Enabled experiences"
          description={`${enabledCount} onboarding capabilities are currently enabled.`}
        />
        <div className="mt-5">
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
      </SettingsCard>

      <section className="mt-7">
        <SectionHeader
          title="Configuration areas"
          description="Each area uses the same status, save, validation, and permission patterns."
        />
        <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sections.map((section) => {
            const enabled = section.flag === null ? true : config[section.flag];
            const Icon = section.icon;
            return (
              <Link key={section.path} href={`/dashboard/guilds/${guildId}/onboarding/${section.path}`}>
                <ModuleCard
                  className="h-full"
                  icon={<Icon size={18} />}
                  title={section.title}
                  description={section.description}
                  enabled={enabled}
                />
              </Link>
            );
          })}
        </div>
      </section>
    </>
  );
}
