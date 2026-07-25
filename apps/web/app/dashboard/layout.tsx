import { DashboardNav } from '@/components/dashboard-nav';
import { requireDashboardSession } from '@/lib/session';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireDashboardSession();
  return (
    <div className="dashboard-shell">
      <DashboardNav session={session} />
      <main className="min-w-0 p-5 sm:p-8 lg:p-10">{children}</main>
    </div>
  );
}

