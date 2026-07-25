import { CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/card';

const services = ['Discord gateway', 'Public API', 'Dashboard', 'PostgreSQL', 'Redis and queues'];

export default function StatusPage() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-20">
      <p className="text-sm font-bold uppercase tracking-[.18em] text-emerald-500">System status</p>
      <h1 className="mt-4 text-5xl font-black tracking-tight">Operational overview</h1>
      <p className="mt-5 text-[var(--muted)]">
        Runtime health comes from each application’s liveness and readiness probes. Connect this
        page to production monitoring after deployment.
      </p>
      <Card className="mt-10">
        <div className="mb-5 flex items-center gap-3 rounded-xl bg-emerald-500/10 p-4 font-semibold text-emerald-500">
          <CheckCircle2 size={20} /> Foundation checks are configured
        </div>
        <div className="divide-y">
          {services.map((service) => (
            <div key={service} className="flex items-center justify-between py-4">
              <span>{service}</span>
              <span className="text-sm text-[var(--muted)]">Awaiting deployment telemetry</span>
            </div>
          ))}
        </div>
      </Card>
    </main>
  );
}

