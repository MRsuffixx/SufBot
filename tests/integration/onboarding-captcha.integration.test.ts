import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { afterAll, describe, expect, it } from 'vitest';
import { CaptchaStore, type CaptchaPresentation } from '@sufbot/onboarding';

const redisUrl = process.env['TEST_REDIS_URL'];
const run = redisUrl === undefined ? describe.skip : describe;
const namespace = `sufbot:test:captcha:${randomUUID()}`;
const signingSecret = 'integration-only-captcha-secret-with-32-bytes';
const guildId = '986000000000000001';

const answerFor = (challenge: CaptchaPresentation): string => {
  if (challenge.mode === 'IMAGE_TEXT' && challenge.imageText !== null) {
    return challenge.imageText;
  }
  if (challenge.mode === 'MODAL_TEXT') {
    const code = challenge.publicPrompt.replace('Enter this code backwards: ', '');
    return [...code].reverse().join('');
  }
  if (challenge.mode === 'ARITHMETIC') {
    const match = /^What is (\d+) ([−+]) (\d+)\?$/u.exec(challenge.publicPrompt);
    if (match === null) throw new TypeError('Unexpected arithmetic challenge.');
    const left = Number(match[1]);
    const right = Number(match[3]);
    return String(match[2] === '+' ? left + right : left - right);
  }
  if (
    challenge.mode === 'BUTTON_SEQUENCE' &&
    challenge.sequenceChoices !== null &&
    challenge.sequenceTarget !== null
  ) {
    return challenge.sequenceTarget
      .map((symbol) => String(challenge.sequenceChoices?.indexOf(symbol)))
      .join('');
  }
  throw new TypeError('Captcha presentation is incomplete.');
};

run('onboarding captcha Redis state machine', () => {
  const stores: CaptchaStore[] = [];
  const inspection = redisUrl === undefined ? null : new Redis(redisUrl);

  const createStore = (): CaptchaStore => {
    const store = new CaptchaStore(redisUrl as string, {
      namespace,
      signingSecret,
      userStartCooldownSeconds: 1,
      guildStartsPerMinute: 100,
    });
    stores.push(store);
    return store;
  };

  afterAll(async () => {
    if (inspection !== null) {
      const keys = await inspection.keys(`${namespace}:*`);
      if (keys.length > 0) await inspection.del(...keys);
      await inspection.quit();
    }
    await Promise.all(stores.map(async (store) => store.close()));
  });

  it('stores only the answer HMAC and consumes a correct answer once under concurrency', async () => {
    const store = createStore();
    const userId = '986000000000000002';
    const created = await store.create(guildId, userId, 'IMAGE_TEXT', {
      captchaLength: 6,
      captchaExpiresSeconds: 120,
      maxAttempts: 3,
      lockoutSeconds: 60,
    });
    expect(created.status).toBe('CREATED');
    if (created.status !== 'CREATED') return;
    const answer = answerFor(created.challenge);
    const challengeKey = `${namespace}:verification:${guildId}:${userId}:${created.challenge.challengeId}`;
    const stored = await inspection?.hgetall(challengeKey);
    expect(stored?.['expectedHash']).toMatch(/^[a-f0-9]{64}$/u);
    expect(Object.values(stored ?? {})).not.toContain(answer);

    const results = await Promise.all([
      store.verify(guildId, userId, created.challenge.challengeId, answer, 60),
      store.verify(guildId, userId, created.challenge.challengeId, answer, 60),
    ]);
    expect(results.filter((result) => result.status === 'SUCCESS')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'REPLAY')).toHaveLength(1);
  });

  it('decrements attempts atomically and locks after the configured bound', async () => {
    const store = createStore();
    const userId = '986000000000000003';
    const created = await store.create(guildId, userId, 'ARITHMETIC', {
      captchaLength: 6,
      captchaExpiresSeconds: 120,
      maxAttempts: 3,
      lockoutSeconds: 60,
    });
    expect(created.status).toBe('CREATED');
    if (created.status !== 'CREATED') return;
    await expect(
      store.verify(guildId, userId, created.challenge.challengeId, 'wrong', 60),
    ).resolves.toEqual({ status: 'INVALID', attemptsRemaining: 2 });
    await expect(
      store.verify(guildId, userId, created.challenge.challengeId, 'wrong', 60),
    ).resolves.toEqual({ status: 'INVALID', attemptsRemaining: 1 });
    await expect(
      store.verify(guildId, userId, created.challenge.challengeId, 'wrong', 60),
    ).resolves.toMatchObject({ status: 'LOCKED' });
    await expect(
      store.create(guildId, userId, 'ARITHMETIC', {
        captchaLength: 6,
        captchaExpiresSeconds: 120,
        maxAttempts: 3,
        lockoutSeconds: 60,
      }),
    ).resolves.toMatchObject({ status: 'LOCKED' });
  });

  it('does not reset the failure budget when a challenge is replaced', async () => {
    const store = createStore();
    const userId = '986000000000000004';
    const first = await store.create(guildId, userId, 'MODAL_TEXT', {
      captchaLength: 6,
      captchaExpiresSeconds: 120,
      maxAttempts: 3,
      lockoutSeconds: 60,
    });
    expect(first.status).toBe('CREATED');
    if (first.status !== 'CREATED') return;
    await expect(
      store.verify(guildId, userId, first.challenge.challengeId, 'wrong', 60),
    ).resolves.toEqual({ status: 'INVALID', attemptsRemaining: 2 });
    await inspection?.del(`${namespace}:verification-rate:user:${guildId}:${userId}`);
    const replacement = await store.create(guildId, userId, 'MODAL_TEXT', {
      captchaLength: 6,
      captchaExpiresSeconds: 120,
      maxAttempts: 3,
      lockoutSeconds: 60,
    });
    expect(replacement).toMatchObject({
      status: 'CREATED',
      challenge: { attemptsRemaining: 2 },
    });
  });
});
