import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  Blocks,
  CheckCircle2,
  Gauge,
  LockKeyhole,
  RadioTower,
  ShieldCheck,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { botInviteUrl } from '@/lib/discord';

const capabilities = [
  {
    icon: ShieldCheck,
    title: 'Permission-aware by default',
    body: 'Every command is checked at execution time against Discord permissions, server modules, and explicit policy.',
  },
  {
    icon: RadioTower,
    title: 'Configuration everywhere',
    body: 'Versioned cache invalidation keeps every bot process aligned after a dashboard change.',
  },
  {
    icon: Activity,
    title: 'Operations you can trace',
    body: 'Structured request, command, job, and audit records provide a clear operational trail.',
  },
] as const;

export default function LandingPage() {
  return (
    <main>
      <section className="hero-glow overflow-hidden border-b border-[var(--border)]">
        <div className="mx-auto grid min-h-[680px] max-w-7xl items-center gap-14 px-5 py-20 lg:grid-cols-[1.08fr_.92fr]">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)]">
              <span className="size-2 rounded-full bg-emerald-500" />
              Built for public, multi-server operation
            </div>
            <h1 className="text-balance max-w-3xl text-5xl font-black leading-[1.02] tracking-[-.045em] sm:text-7xl">
              Discord operations,
              <span className="block text-violet-600">clearly controlled.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-[var(--muted)] sm:text-xl">
              SufBot gives communities a secure command layer, a permission-aware dashboard, and an
              architecture ready to grow without turning server management into guesswork.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/login" className={buttonVariants({ size: 'lg' })}>
                Open dashboard <ArrowRight size={18} />
              </Link>
              <a
                href={botInviteUrl()}
                className={buttonVariants({ variant: 'secondary', size: 'lg' })}
              >
                Invite SufBot
              </a>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-7 gap-y-3 text-sm text-[var(--muted)]">
              {['Guild-isolated data', 'OAuth2 access checks', 'English + Turkish'].map((item) => (
                <span key={item} className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-500" />
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-8 rounded-full bg-violet-500/15 blur-3xl" />
            <Card className="relative overflow-hidden p-0">
              <div className="flex items-center justify-between border-b p-5">
                <div>
                  <p className="text-sm font-semibold">Community operations</p>
                  <p className="text-xs text-[var(--muted)]">
                    MRsuffix Workshop · live configuration
                  </p>
                </div>
                <span className="rounded-full bg-emerald-500/12 px-3 py-1 text-xs font-semibold text-emerald-500">
                  Healthy
                </span>
              </div>
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                <div className="rounded-2xl bg-violet-600 p-5 text-white sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <Gauge size={22} />
                    <span className="text-xs opacity-75">Last 24 hours</span>
                  </div>
                  <p className="mt-8 text-4xl font-black">99.98%</p>
                  <p className="mt-1 text-sm text-violet-100">successful interactions</p>
                </div>
                <Metric icon={Blocks} label="Modules enabled" value="2 / 2" />
                <Metric icon={LockKeyhole} label="Policy checks" value="1,842" />
              </div>
              <div className="border-t p-5">
                <div className="mb-3 flex items-center justify-between text-xs">
                  <span className="font-semibold">Recent change</span>
                  <span className="text-[var(--muted)]">just now</span>
                </div>
                <div className="rounded-xl border bg-[var(--background)] p-4 text-sm">
                  Moderation module enabled by <strong>mrsuffix</strong>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-24">
        <div className="max-w-2xl">
          <p className="text-sm font-bold uppercase tracking-[.18em] text-violet-600">
            Control plane
          </p>
          <h2 className="mt-4 text-balance text-4xl font-black tracking-tight sm:text-5xl">
            The safe foundation beneath every command.
          </h2>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {capabilities.map(({ icon: Icon, title, body }) => (
            <Card key={title}>
              <Icon className="text-violet-600" />
              <h3 className="mt-8 text-xl font-bold">{title}</h3>
              <p className="mt-3 leading-7 text-[var(--muted)]">{body}</p>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Blocks;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border p-4">
      <Icon size={19} className="text-[var(--muted)]" />
      <p className="mt-7 text-2xl font-black">{value}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">{label}</p>
    </div>
  );
}
