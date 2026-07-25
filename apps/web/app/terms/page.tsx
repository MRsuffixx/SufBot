export default function TermsPage() {
  const sections = [
    [
      'Responsible use',
      'Do not use SufBot to harass users, evade Discord enforcement, automate abuse, or violate applicable law or Discord policies.',
    ],
    [
      'Administrator authority',
      'You must have legitimate authority to install or configure SufBot in a guild. Dashboard access is continuously tied to Discord guild permissions.',
    ],
    [
      'Service availability',
      'The platform is provided without a guarantee of uninterrupted availability. Operational limits may be applied to protect users and infrastructure.',
    ],
    [
      'Configuration responsibility',
      'Guild administrators are responsible for reviewing role hierarchy, bot permissions, modules, and command overrides before enabling moderation functions.',
    ],
    [
      'Changes',
      'These terms may be revised as the platform adds modules, premium capabilities, or additional integrations.',
    ],
  ] as const;
  return (
    <main className="mx-auto max-w-3xl px-5 py-20">
      <h1 className="text-5xl font-black tracking-tight">Terms of service</h1>
      <p className="mt-6 text-lg leading-8 text-[var(--muted)]">
        These terms govern access to the SufBot bot, dashboard, and API.
      </p>
      <div className="mt-12 space-y-9">
        {sections.map(([heading, body]) => (
          <section key={heading}>
            <h2 className="text-xl font-bold">{heading}</h2>
            <p className="mt-3 leading-7 text-[var(--muted)]">{body}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
