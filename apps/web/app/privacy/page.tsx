export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      intro="SufBot collects only the data needed to authenticate administrators, operate commands, isolate guild configuration, and secure the platform."
      sections={[
        [
          'Data we process',
          'Discord user and guild identifiers, administrator permission snapshots, guild settings, command usage metadata, audit records, and encrypted OAuth credentials. Message content is not logged by default.',
        ],
        [
          'How data is used',
          'Data is used to provide the dashboard and bot, enforce access control, diagnose failures, prevent abuse, and maintain audit history.',
        ],
        [
          'Retention and deletion',
          'Audit retention is controlled by configuration. OAuth credentials are removed when sessions are revoked. Guild records are marked inactive when the bot leaves so operational history remains accountable.',
        ],
        [
          'Security',
          'Credentials are encrypted or hashed where appropriate. Logs redact authorization headers, cookies, tokens, database URLs, Redis URLs, and service secrets.',
        ],
        [
          'Contact',
          'Security and privacy requests can be submitted through the project owner MRsuffix on GitHub.',
        ],
      ]}
    />
  );
}

function LegalPage({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: string;
  sections: readonly (readonly [string, string])[];
}) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-20">
      <h1 className="text-5xl font-black tracking-tight">{title}</h1>
      <p className="mt-6 text-lg leading-8 text-[var(--muted)]">{intro}</p>
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
