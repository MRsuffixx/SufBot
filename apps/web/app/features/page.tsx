import { Boxes, Database, KeyRound, Languages, Radar, Workflow } from 'lucide-react';
import { Card } from '@/components/ui/card';

const features = [
  [
    'Central authorization',
    'Policy decisions combine platform roles, Discord permission bits, role grants, module state, and feature flags.',
    KeyRound,
  ],
  [
    'Tenant isolation',
    'Guild IDs remain explicit in queries, cache keys, audit records, queue payloads, and API authorization.',
    Database,
  ],
  [
    'Modular commands',
    'General and Moderation demonstrate independent metadata, configuration schemas, policies, and invalidation.',
    Boxes,
  ],
  [
    'Distributed coordination',
    'Local cache, Redis, Pub/Sub, and versioned events keep horizontally scaled bot processes synchronized.',
    Workflow,
  ],
  [
    'Operational visibility',
    'Request IDs, correlation IDs, structured logs, readiness probes, and append-oriented audit data are built in.',
    Radar,
  ],
  [
    'Localization',
    'English and Turkish command responses start the translation system with per-guild language selection.',
    Languages,
  ],
] as const;

export default function FeaturesPage() {
  return (
    <main className="mx-auto max-w-7xl px-5 py-20">
      <div className="max-w-3xl">
        <p className="text-sm font-bold uppercase tracking-[.18em] text-violet-600">
          Platform features
        </p>
        <h1 className="mt-4 text-5xl font-black tracking-tight">
          Serious infrastructure, calm controls.
        </h1>
        <p className="mt-6 text-lg leading-8 text-[var(--muted)]">
          SufBot’s first release concentrates on the boundaries that get harder to retrofit later:
          identity, tenancy, policy, observability, and scalable configuration.
        </p>
      </div>
      <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {features.map(([title, body, Icon]) => (
          <Card key={title}>
            <Icon className="text-violet-600" />
            <h2 className="mt-7 text-xl font-bold">{title}</h2>
            <p className="mt-3 leading-7 text-[var(--muted)]">{body}</p>
          </Card>
        ))}
      </div>
    </main>
  );
}
