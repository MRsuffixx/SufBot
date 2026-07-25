import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://sufbot.tr'),
  title: {
    default: 'SufBot — Discord operations, clearly controlled',
    template: '%s · SufBot',
  },
  description:
    'A secure, modular Discord bot and server management platform built for serious communities.',
  applicationName: 'SufBot',
  openGraph: {
    type: 'website',
    siteName: 'SufBot',
    title: 'SufBot — Discord operations, clearly controlled',
    description:
      'Moderation, configuration, permissions, and observability for Discord communities.',
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}

