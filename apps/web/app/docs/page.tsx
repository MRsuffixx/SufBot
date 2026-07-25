import Link from 'next/link';
import { Card } from '@/components/ui/card';

export default function DocsPage() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-20">
      <h1 className="text-5xl font-black tracking-tight">Documentation</h1>
      <p className="mt-5 text-lg text-[var(--muted)]">
        Operator documentation ships with the source repository. This dashboard focuses on guild
        configuration and access.
      </p>
      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        <Card><h2 className="font-bold">Guild administrators</h2><p className="mt-3 text-sm leading-6 text-[var(--muted)]">Sign in with Discord, select a manageable guild, then configure modules and command access.</p><Link className="mt-5 inline-block font-semibold text-violet-600" href="/login">Open dashboard →</Link></Card>
        <Card><h2 className="font-bold">Platform operators</h2><p className="mt-3 text-sm leading-6 text-[var(--muted)]">Architecture, database, OAuth, deployment, and threat-model documents are maintained alongside the code.</p><a className="mt-5 inline-block font-semibold text-violet-600" href="https://github.com/MRsuffixx" target="_blank" rel="noreferrer">View GitHub →</a></Card>
      </div>
    </main>
  );
}

