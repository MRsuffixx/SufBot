import Link from 'next/link';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-primitives';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';

export function OnboardingSectionShell({
  guildId,
  title,
  description,
  status,
  children,
}: {
  guildId: string;
  title: string;
  description: string;
  status: string;
  children?: React.ReactNode;
}) {
  const normalized = status.toLowerCase();
  const statusVariant =
    normalized === 'enabled' || normalized === 'healthy'
      ? 'success'
      : normalized === 'disabled' || normalized === 'not_configured'
        ? 'neutral'
        : normalized === 'broken'
          ? 'danger'
          : 'warning';
  return (
    <div>
      <PageHeader
        eyebrow="Member onboarding"
        title={title}
        description={description}
        status={<Badge variant={statusVariant}>{status.replaceAll('_', ' ')}</Badge>}
        actions={
          <>
            <Link
              href={`/dashboard/guilds/${guildId}/onboarding`}
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            >
              <ArrowLeft size={14} /> Onboarding
            </Link>
            <Link href="/docs" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              <BookOpen size={14} /> Docs
            </Link>
          </>
        }
      />
      {children}
    </div>
  );
}
