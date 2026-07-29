import { describe, expect, it } from 'vitest';
import {
  AutoRoleConfigSchema,
  OnboardingDiscordResourcesSchema,
  OnboardingMessageSchema,
  VerificationConfigSchema,
  VerificationSetupRequestSchema,
  WelcomeCardConfigSchema,
  WelcomeConfigSchema,
  neutralizeMassMentions,
  renderOnboardingMessage,
  renderOnboardingTemplate,
  safeTemplateText,
  deduplicateRoleIds,
  evaluateOnboardingRole,
  isPostVerificationConditionSatisfied,
  validateAutoRoleResources,
  validateWelcomeResources,
  createCaptchaMaterial,
  generateWelcomeCard,
  validateRemoteImageUrl,
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
    expect(rendered.value).toBe('Ada joined SufBot; {unknown.value}; ${process.env.SECRET}');
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

  it('evaluates captcha and Membership Screening role conditions centrally', () => {
    const state = { captchaVerified: true, membershipScreeningCompleted: false };
    expect(isPostVerificationConditionSatisfied('CAPTCHA_ONLY', state)).toBe(true);
    expect(isPostVerificationConditionSatisfied('SCREENING_ONLY', state)).toBe(false);
    expect(isPostVerificationConditionSatisfied('EITHER', state)).toBe(true);
    expect(isPostVerificationConditionSatisfied('BOTH', state)).toBe(false);
  });

  it('rejects cross-guild, managed, everyone, and unreachable roles', () => {
    const baseRole = {
      id: '12345678901234567',
      guildId: '22345678901234567',
      managed: false,
      position: 2,
      isEveryone: false,
    };
    expect(evaluateOnboardingRole(baseRole, baseRole.guildId, 3)).toEqual({
      assignable: true,
    });
    expect(evaluateOnboardingRole({ ...baseRole, managed: true }, baseRole.guildId, 3)).toEqual({
      assignable: false,
      code: 'MANAGED_ROLE',
    });
    expect(evaluateOnboardingRole({ ...baseRole, position: 3 }, baseRole.guildId, 3)).toEqual({
      assignable: false,
      code: 'BOT_ROLE_TOO_LOW',
    });
    expect(deduplicateRoleIds(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('rejects dashboard resources that are absent or not executable by the bot', () => {
    const resources = OnboardingDiscordResourcesSchema.parse({
      guildId: '12345678901234567',
      refreshedAt: '2026-07-29T00:00:00.000Z',
      bot: {
        canManageRoles: true,
        canManageChannels: true,
        highestRolePosition: 10,
      },
      channels: [
        {
          id: '22345678901234567',
          name: 'welcome',
          type: 'TEXT',
          canView: true,
          canSend: true,
          canEmbed: false,
          canAttach: false,
          canManage: true,
        },
      ],
      categories: [],
      roles: [
        {
          id: '32345678901234567',
          name: 'member',
          color: 0,
          position: 2,
          managed: false,
          assignable: false,
        },
      ],
    });
    const welcome = WelcomeConfigSchema.parse({
      channelId: '22345678901234567',
      message: { mode: 'EMBED', embed: { title: 'Welcome' } },
    });
    expect(validateWelcomeResources(welcome, resources)).toMatchObject([
      { code: 'CHANNEL_NOT_SENDABLE' },
    ]);
    const roles = AutoRoleConfigSchema.parse({
      joinHumanRoleIds: ['32345678901234567'],
    });
    expect(validateAutoRoleResources(roles, resources)).toMatchObject([
      { code: 'ROLE_NOT_ASSIGNABLE' },
    ]);
  });

  it('requires explicit permission confirmation and a role for dedicated mode', () => {
    const base = {
      expectedVersion: 1,
      operation: 'SETUP',
      mode: 'DEDICATED_UNVERIFIED_ROLE',
      channel: { strategy: 'CREATE', name: 'verify' },
      verifiedRole: { strategy: 'CREATE', name: 'verified' },
      migration: { mode: 'NONE' },
    };
    expect(VerificationSetupRequestSchema.safeParse(base).success).toBe(false);
    expect(
      VerificationSetupRequestSchema.safeParse({
        ...base,
        confirmed: true,
        unverifiedRole: { strategy: 'CREATE', name: 'unverified' },
      }).success,
    ).toBe(true);
    expect(
      VerificationSetupRequestSchema.safeParse({
        ...base,
        operation: 'DRY_RUN',
        unverifiedRole: { strategy: 'CREATE', name: 'unverified' },
      }).success,
    ).toBe(true);
  });

  it('generates bounded captcha material without ambiguous image characters', () => {
    const image = createCaptchaMaterial('IMAGE_TEXT', 8);
    expect(image.imageText).toMatch(/^[A-HJ-NP-Z2-9]{8}$/u);
    expect(image.expectedAnswer).toBe(image.imageText);

    const arithmetic = createCaptchaMaterial('ARITHMETIC', 6);
    expect(arithmetic.publicPrompt).toMatch(/^What is \d+ [−+] \d+\?$/u);
    expect(Number.isInteger(Number(arithmetic.expectedAnswer))).toBe(true);

    const sequence = createCaptchaMaterial('BUTTON_SEQUENCE', 8);
    expect(sequence.sequenceChoices).toHaveLength(5);
    expect(sequence.sequenceTarget).toHaveLength(5);
    expect(sequence.expectedAnswer).toMatch(/^[0-4]{5}$/u);
  });

  it('blocks local image targets and renders bounded welcome cards in memory', async () => {
    await expect(validateRemoteImageUrl('https://127.0.0.1/private.png')).rejects.toThrow(
      /non-public/u,
    );
    await expect(validateRemoteImageUrl('http://example.com/image.png')).rejects.toThrow(
      /public HTTPS/u,
    );
    const onePixelPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    const config = WelcomeCardConfigSchema.parse({ width: 640, height: 240 });
    const generated = await generateWelcomeCard({
      config,
      avatar: onePixelPng,
      text: {
        title: 'WELCOME',
        subtitle: '<script>not executable</script>',
        body: 'Welcome to SufBot',
        memberCount: 'Member #42',
      },
    });
    expect(generated.filename).toBe('welcome-card.png');
    expect(generated.buffer.subarray(1, 4).toString()).toBe('PNG');
    expect(generated.buffer.length).toBeLessThan(8 * 1024 * 1024);
  });
});
