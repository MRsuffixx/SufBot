import { describe, expect, it } from 'vitest';
import {
  AutoRoleConfigSchema,
  OnboardingMessageSchema,
  VerificationConfigSchema,
  WelcomeCardConfigSchema,
  WelcomeConfigSchema,
  neutralizeMassMentions,
  renderOnboardingMessage,
  renderOnboardingTemplate,
  safeTemplateText,
} from '@sufbot/onboarding';

describe('onboarding contracts', () => {
  it('applies safe defaults and Discord-compatible verification bounds', () => {
    const verification = VerificationConfigSchema.parse({});
    expect(verification.channelName).toBe('doğrulama');
    expect(verification.verifiedRoleName).toBe('doğrulandı');
    expect(verification.captchaExpiresSeconds).toBeGreaterThanOrEqual(120);
    expect(verification.maxAttempts).toBeGreaterThanOrEqual(3);
    expect(verification.kickAfterFailure).toBe(false);
  });

  it('rejects oversized embeds and unsafe remote image URLs', () => {
    expect(
      OnboardingMessageSchema.safeParse({
        mode: 'EMBED',
        embed: { description: 'x'.repeat(4097) },
      }).success,
    ).toBe(false);
    expect(
      WelcomeCardConfigSchema.safeParse({
        backgroundUrl: 'http://127.0.0.1/private.png',
      }).success,
    ).toBe(false);
    expect(
      WelcomeCardConfigSchema.safeParse({
        width: 1920,
        height: 1080,
        backgroundUrl: 'https://cdn.example.test/background.png',
      }).success,
    ).toBe(true);
  });

  it('deduplicates bounded Discord role lists', () => {
    const role = '12345678901234567';
    const parsed = AutoRoleConfigSchema.parse({
      joinHumanRoleIds: [role, role],
    });
    expect(parsed.joinHumanRoleIds).toEqual([role]);
  });

  it('requires a channel-independent message structure to remain valid', () => {
    const welcome = WelcomeConfigSchema.parse({});
    expect(welcome.channelId).toBeNull();
    expect(welcome.message.content).toContain('{user.mention}');
    expect(welcome.message.allowedMentions.allowEveryoneMention).toBe(false);
  });

  it('renders only declared variables without evaluating template content', () => {
    const rendered = renderOnboardingTemplate(
      '{user.displayName} joined {server.name}; {unknown.value}; ${process.env.SECRET}',
      {
        'user.displayName': 'Ada',
        'server.name': 'SufBot',
      },
    );
    expect(rendered.value).toBe(
      'Ada joined SufBot; {unknown.value}; ${process.env.SECRET}',
    );
    expect(rendered.warnings).toEqual([
      { code: 'UNKNOWN_VARIABLE', variable: 'unknown.value' },
      { code: 'UNKNOWN_VARIABLE', variable: 'process.env.SECRET' },
    ]);
  });

  it('keeps mass mentions inert and limits real mentions to the joining user', () => {
    expect(neutralizeMassMentions('@everyone @here')).toBe('@\u200beveryone @\u200bhere');
    expect(safeTemplateText('`@everyone`')).toBe('\u02cb@\u200beveryone\u02cb');
    const message = OnboardingMessageSchema.parse({
      mode: 'TEXT',
      content: 'Welcome {user.mention} to {server.name}',
    });
    const rendered = renderOnboardingMessage(
      message,
      {
        'user.mention': '<@12345678901234567>',
        'server.name': safeTemplateText('@everyone'),
      },
      '12345678901234567',
    );
    expect(rendered.content).toContain('@\u200beveryone');
    expect(rendered.allowedMentions).toEqual({
      users: ['12345678901234567'],
      roles: [],
      parse: [],
      repliedUser: false,
    });
  });
});
