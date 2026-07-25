import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--border)] py-10 text-sm text-[var(--muted)]">
      <div className="mx-auto flex max-w-7xl flex-col justify-between gap-6 px-5 sm:flex-row">
        <p>© 2026 MRsuffix. SufBot is not affiliated with Discord.</p>
        <nav className="flex flex-wrap gap-5">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/status">Status</Link>
          <a href="https://github.com/MRsuffixx" rel="noreferrer" target="_blank">
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}

