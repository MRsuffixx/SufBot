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
    images: [{ url: '/og.png', width: 1720, height: 907, alt: 'SufBot control plane' }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og.png'],
  },
  robots: { index: true, follow: true },
};

const themeBootstrap = `
  try {
    var value = localStorage.getItem('sufbot-theme');
    document.documentElement.dataset.theme =
      value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
  } catch (_) {
    document.documentElement.dataset.theme = 'system';
  }
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
