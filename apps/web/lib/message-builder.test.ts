import { describe, expect, it } from 'vitest';
import { defaultWelcomeConfig } from '@sufbot/onboarding';
import {
  cloneMessageTemplate,
  formatHexColor,
  insertVariableAtSelection,
  moveEmbedField,
  parseHexColor,
  renderPreviewVariables,
  validateBuilderMessage,
} from './message-builder';

describe('message builder domain helpers', () => {
  it('supports text, embed, and combined message modes', () => {
    const base = defaultWelcomeConfig().message;
    expect(validateBuilderMessage({ ...base, mode: 'TEXT' }).valid).toBe(true);
    expect(
      validateBuilderMessage({
        ...base,
        mode: 'EMBED',
        embed: { ...base.embed, title: 'Welcome' },
      }).valid,
    ).toBe(true);
    expect(
      validateBuilderMessage({
        ...base,
        mode: 'TEXT_AND_EMBED',
        embed: { ...base.embed, description: 'Hello' },
      }).valid,
    ).toBe(true);
  });

  it('reports required content and Discord character limits', () => {
    const base = defaultWelcomeConfig().message;
    const missing = validateBuilderMessage({ ...base, content: '' });
    expect(missing.issues).toContainEqual(
      expect.objectContaining({ path: 'content' }),
    );
    const longEmbed = validateBuilderMessage({
      ...base,
      mode: 'EMBED',
      embed: {
        ...base.embed,
        description: 'x'.repeat(4096),
        footerText: 'y'.repeat(1905),
      },
    });
    expect(longEmbed.totalEmbedCharacters).toBe(6001);
    expect(longEmbed.issues).toContainEqual(
      expect.objectContaining({ path: 'embed' }),
    );
  });

  it('reorders fields without mutating the saved draft', () => {
    const fields = [
      { name: 'First', value: '1', inline: false },
      { name: 'Second', value: '2', inline: true },
      { name: 'Third', value: '3', inline: false },
    ];
    const moved = moveEmbedField(fields, 2, 0);
    expect(moved.map((field) => field.name)).toEqual(['Third', 'First', 'Second']);
    expect(fields.map((field) => field.name)).toEqual(['First', 'Second', 'Third']);
  });

  it('inserts variables at the current cursor selection', () => {
    expect(insertVariableAtSelection('Hello name!', '{user.mention}', 6, 10)).toEqual({
      value: 'Hello {user.mention}!',
      cursor: 20,
    });
  });

  it('parses and normalizes embed colors safely', () => {
    expect(parseHexColor('#5865f2')).toBe(0x5865f2);
    expect(parseHexColor('invalid', 0x123456)).toBe(0x123456);
    expect(formatHexColor(0x00aaff)).toBe('#00aaff');
  });

  it('keeps allowed mention policy separate while cloning drafts', () => {
    const saved = defaultWelcomeConfig().message;
    const draft = cloneMessageTemplate(saved);
    draft.allowedMentions.mentionUser = false;
    expect(saved.allowedMentions.mentionUser).toBe(true);
    expect(draft.allowedMentions.allowEveryoneMention).toBe(false);
  });

  it('renders stable example values in the local preview', () => {
    expect(renderPreviewVariables('Welcome {user.displayName} to {server.name}')).toBe(
      'Welcome Ada to SufBot Community',
    );
  });
});
