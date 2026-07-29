import { notFound } from 'next/navigation';
import { defaultWelcomeConfig } from '@sufbot/onboarding';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { UiShowcase } from '@/components/dashboard/ui-showcase';

export default function DevelopmentUiPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <DashboardShell
      user={{
        name: 'Ada Developer',
        image: null,
        platformRole: 'DEVELOPER',
      }}
      guilds={[
        {
          id: '123456789012345678',
          name: 'SufBot Community',
          iconHash: null,
          botInstalled: true,
          botOnline: true,
          permissionHealthy: true,
          premiumActive: true,
        },
      ]}
      initialLocale="en"
    >
      <UiShowcase initialMessage={defaultWelcomeConfig().message} />
    </DashboardShell>
  );
}
