import { Card } from '@/components/ui/card';
import { BillingStatusPoller } from '@/components/billing-status-poller';
import { requireDashboardSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function PremiumStatusPage() {
  await requireDashboardSession();
  return (
    <main className="mx-auto max-w-2xl px-5 py-20">
      <Card>
        <BillingStatusPoller />
      </Card>
    </main>
  );
}
