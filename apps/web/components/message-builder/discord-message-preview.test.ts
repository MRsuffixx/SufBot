import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { defaultWelcomeConfig } from '@sufbot/onboarding';
import { DiscordMessagePreview } from './discord-message-preview';

describe('DiscordMessagePreview', () => {
  it('renders normal content, embed content, bot identity, and variables', () => {
    const base = defaultWelcomeConfig().message;
    const html = renderToStaticMarkup(
      createElement(DiscordMessagePreview, {
        message: {
          ...base,
          mode: 'TEXT_AND_EMBED',
          content: 'Welcome {user.mention}',
          embed: {
            ...base.embed,
            title: 'Hello {user.displayName}',
            description: 'Welcome to {server.name}',
            fields: [{ name: 'Members', value: '{server.memberCount}', inline: true }],
          },
        },
        background: 'dark',
        viewport: 'desktop',
      }),
    );
    expect(html).toContain('SufBot');
    expect(html).toContain('BOT');
    expect(html).toContain('Welcome ');
    expect(html).toContain('Ada');
    expect(html).toContain('SufBot Community');
    expect(html).toContain('12,481');
  });
});
