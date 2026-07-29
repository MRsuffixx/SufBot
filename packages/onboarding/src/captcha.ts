import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { Redis } from 'ioredis';
import type { OnboardingCaptchaType, VerificationConfig } from './contracts.js';

const CAPTCHA_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SEQUENCE_SYMBOLS = ['▲', '◆', '●', '■', '★'] as const;
const SNOWFLAKE = /^\d{17,20}$/u;

type CaptchaMaterial = {
  expectedAnswer: string;
  publicPrompt: string;
  imageText: string | null;
  sequenceChoices: readonly string[] | null;
  sequenceTarget: readonly string[] | null;
};

export type CaptchaPresentation = {
  challengeId: string;
  mode: OnboardingCaptchaType;
  publicPrompt: string;
  imageText: string | null;
  sequenceChoices: readonly string[] | null;
  sequenceTarget: readonly string[] | null;
  expiresAt: string;
  attemptsRemaining: number;
};

export type CaptchaCreateResult =
  | { status: 'CREATED'; challenge: CaptchaPresentation }
  | { status: 'LOCKED'; retryAfterSeconds: number }
  | { status: 'RATE_LIMITED'; retryAfterSeconds: number };

export type CaptchaVerifyResult =
  | { status: 'SUCCESS' }
  | { status: 'INVALID'; attemptsRemaining: number }
  | { status: 'LOCKED'; retryAfterSeconds: number }
  | { status: 'EXPIRED' }
  | { status: 'REPLAY' };

type CaptchaStoredState = {
  expectedHash: string;
  mode: OnboardingCaptchaType;
  attemptsRemaining: number;
  expectedLength: number;
  progress: string;
};

const normalizeCaptchaAnswer = (answer: string): string =>
  answer.normalize('NFKC').trim().toUpperCase();

const randomString = (length: number): string =>
  Array.from({ length }, () => CAPTCHA_ALPHABET[randomInt(CAPTCHA_ALPHABET.length)]).join('');

const shuffled = <T>(values: readonly T[]): T[] => {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = randomInt(index + 1);
    [copy[index], copy[target]] = [copy[target] as T, copy[index] as T];
  }
  return copy;
};

export const createCaptchaMaterial = (
  mode: OnboardingCaptchaType,
  configuredLength: number,
): CaptchaMaterial => {
  const length = Math.max(4, Math.min(8, configuredLength));
  switch (mode) {
    case 'IMAGE_TEXT': {
      const code = randomString(length);
      return {
        expectedAnswer: code,
        publicPrompt: 'Enter the characters shown in the image.',
        imageText: code,
        sequenceChoices: null,
        sequenceTarget: null,
      };
    }
    case 'ARITHMETIC': {
      const left = randomInt(12, 80);
      const right = randomInt(2, Math.min(30, left));
      const subtract = randomInt(2) === 1;
      return {
        expectedAnswer: String(subtract ? left - right : left + right),
        publicPrompt: `What is ${left} ${subtract ? '−' : '+'} ${right}?`,
        imageText: null,
        sequenceChoices: null,
        sequenceTarget: null,
      };
    }
    case 'MODAL_TEXT': {
      const code = randomString(length);
      return {
        expectedAnswer: [...code].reverse().join(''),
        publicPrompt: `Enter this code backwards: ${code}`,
        imageText: null,
        sequenceChoices: null,
        sequenceTarget: null,
      };
    }
    case 'BUTTON_SEQUENCE': {
      const sequenceLength = Math.min(5, length);
      const choices: string[] = shuffled<string>(SEQUENCE_SYMBOLS);
      const target = Array.from(
        { length: sequenceLength },
        () => choices[randomInt(choices.length)] as string,
      );
      return {
        expectedAnswer: target.map((symbol) => String(choices.indexOf(symbol))).join(''),
        publicPrompt: 'Press the buttons in the displayed order.',
        imageText: null,
        sequenceChoices: choices,
        sequenceTarget: target,
      };
    }
  }
};

const compareHashes = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

const toInteger = (value: string | null): number | null => {
  if (value === null || !/^\d+$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

export class CaptchaStore {
  readonly #redis: Redis;

  public constructor(
    redisUrl: string,
    private readonly options: {
      namespace: string;
      signingSecret: string;
      userStartCooldownSeconds?: number;
      guildStartsPerMinute?: number;
      onError?: (error: unknown) => void;
    },
  ) {
    if (options.signingSecret.length < 32) {
      throw new TypeError('Captcha signing secret must contain at least 32 characters.');
    }
    this.#redis = new Redis(redisUrl, {
      lazyConnect: true,
      enableReadyCheck: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 5_000,
      commandTimeout: 2_000,
      retryStrategy: (attempt: number) => Math.min(attempt * 250, 3_000),
    });
    this.#redis.on('error', (error) => options.onError?.(error));
  }

  public async create(
    guildId: string,
    userId: string,
    mode: OnboardingCaptchaType,
    config: Pick<
      VerificationConfig,
      'captchaLength' | 'captchaExpiresSeconds' | 'maxAttempts' | 'lockoutSeconds'
    >,
  ): Promise<CaptchaCreateResult> {
    this.#assertIdentity(guildId, userId);
    await this.#connect();
    const admission = (await this.#redis.eval(
      `
local lockTtl = redis.call('TTL', KEYS[1])
if lockTtl > 0 then return {'LOCKED', tostring(lockTtl)} end
if redis.call('SET', KEYS[2], '1', 'EX', ARGV[1], 'NX') == false then
  return {'RATE_LIMITED', tostring(redis.call('TTL', KEYS[2]))}
end
local count = redis.call('INCR', KEYS[3])
if count == 1 then redis.call('EXPIRE', KEYS[3], 60) end
if count > tonumber(ARGV[2]) then
  return {'RATE_LIMITED', tostring(redis.call('TTL', KEYS[3]))}
end
return {'CREATED', '0'}
`,
      3,
      this.#lockKey(guildId, userId),
      this.#userRateKey(guildId, userId),
      this.#guildRateKey(guildId),
      String(this.options.userStartCooldownSeconds ?? 8),
      String(this.options.guildStartsPerMinute ?? 60),
    )) as [CaptchaCreateResult['status'], string];
    if (admission[0] !== 'CREATED') {
      return {
        status: admission[0],
        retryAfterSeconds: Math.max(1, Number(admission[1]) || 1),
      };
    }

    const material = createCaptchaMaterial(mode, config.captchaLength);
    const challengeId = randomBytes(18).toString('base64url');
    const normalizedAnswer = normalizeCaptchaAnswer(material.expectedAnswer);
    const expectedHash = this.#answerHash(guildId, userId, challengeId, normalizedAnswer);
    const challengeKey = this.#challengeKey(guildId, userId, challengeId);
    const activeKey = this.#activeKey(guildId, userId);
    const previousChallengeId = await this.#redis.get(activeKey);
    const transaction = this.#redis.multi();
    if (previousChallengeId !== null && /^[A-Za-z0-9_-]{24}$/u.test(previousChallengeId)) {
      transaction.del(this.#challengeKey(guildId, userId, previousChallengeId));
    }
    transaction.hset(challengeKey, {
      expectedHash,
      mode,
      attemptsRemaining: String(config.maxAttempts),
      expectedLength: String(normalizedAnswer.length),
      progress: '',
    });
    transaction.expire(challengeKey, config.captchaExpiresSeconds);
    transaction.set(activeKey, challengeId, 'EX', config.captchaExpiresSeconds);
    await transaction.exec();
    return {
      status: 'CREATED',
      challenge: {
        challengeId,
        mode,
        publicPrompt: material.publicPrompt,
        imageText: material.imageText,
        sequenceChoices: material.sequenceChoices,
        sequenceTarget: material.sequenceTarget,
        expiresAt: new Date(Date.now() + config.captchaExpiresSeconds * 1000).toISOString(),
        attemptsRemaining: config.maxAttempts,
      },
    };
  }

  public async verify(
    guildId: string,
    userId: string,
    challengeId: string,
    answer: string,
    lockoutSeconds: number,
  ): Promise<CaptchaVerifyResult> {
    this.#assertChallengeIdentity(guildId, userId, challengeId);
    await this.#connect();
    const state = await this.#readState(guildId, userId, challengeId);
    if (state === null) return this.#missingResult(guildId, userId, challengeId);
    const candidateHash = this.#answerHash(
      guildId,
      userId,
      challengeId,
      normalizeCaptchaAnswer(answer).slice(0, 64),
    );
    if (compareHashes(state.expectedHash, candidateHash)) {
      const consumed = await this.#consumeSuccess(guildId, userId, challengeId, state.expectedHash);
      return consumed ? { status: 'SUCCESS' } : this.#missingResult(guildId, userId, challengeId);
    }
    return this.#recordFailure(
      guildId,
      userId,
      challengeId,
      state.expectedHash,
      lockoutSeconds,
      state.mode === 'BUTTON_SEQUENCE',
    );
  }

  public async appendSequenceChoice(
    guildId: string,
    userId: string,
    challengeId: string,
    choice: number,
    lockoutSeconds: number,
  ): Promise<CaptchaVerifyResult | { status: 'CONTINUE'; entered: number; expected: number }> {
    if (!Number.isInteger(choice) || choice < 0 || choice >= SEQUENCE_SYMBOLS.length) {
      return { status: 'INVALID', attemptsRemaining: 0 };
    }
    this.#assertChallengeIdentity(guildId, userId, challengeId);
    await this.#connect();
    for (let retry = 0; retry < 3; retry += 1) {
      const state = await this.#readState(guildId, userId, challengeId);
      if (state === null) return this.#missingResult(guildId, userId, challengeId);
      if (state.mode !== 'BUTTON_SEQUENCE') {
        return this.#recordFailure(
          guildId,
          userId,
          challengeId,
          state.expectedHash,
          lockoutSeconds,
          true,
        );
      }
      const next = `${state.progress}${choice}`;
      if (next.length >= state.expectedLength) {
        return this.verify(guildId, userId, challengeId, next, lockoutSeconds);
      }
      const changed = await this.#redis.eval(
        `
if redis.call('HGET', KEYS[1], 'expectedHash') ~= ARGV[1] then return 0 end
if redis.call('HGET', KEYS[1], 'progress') ~= ARGV[2] then return 0 end
redis.call('HSET', KEYS[1], 'progress', ARGV[3])
return 1
`,
        1,
        this.#challengeKey(guildId, userId, challengeId),
        state.expectedHash,
        state.progress,
        next,
      );
      if (Number(changed) === 1) {
        return { status: 'CONTINUE', entered: next.length, expected: state.expectedLength };
      }
    }
    return { status: 'REPLAY' };
  }

  public async invalidateUser(guildId: string, userId: string): Promise<void> {
    this.#assertIdentity(guildId, userId);
    await this.#connect();
    const activeKey = this.#activeKey(guildId, userId);
    const challengeId = await this.#redis.get(activeKey);
    const keys = [activeKey];
    if (challengeId !== null && /^[A-Za-z0-9_-]{24}$/u.test(challengeId)) {
      keys.push(this.#challengeKey(guildId, userId, challengeId));
    }
    await this.#redis.del(...keys);
  }

  public async close(): Promise<void> {
    if (this.#redis.status !== 'end') await this.#redis.quit();
  }

  async #readState(
    guildId: string,
    userId: string,
    challengeId: string,
  ): Promise<CaptchaStoredState | null> {
    const values = await this.#redis.hmget(
      this.#challengeKey(guildId, userId, challengeId),
      'expectedHash',
      'mode',
      'attemptsRemaining',
      'expectedLength',
      'progress',
    );
    const expectedHash = values[0] ?? null;
    const mode = values[1] ?? null;
    const attempts = values[2] ?? null;
    const expectedLength = values[3] ?? null;
    const progress = values[4] ?? null;
    const attemptsRemaining = toInteger(attempts);
    const parsedLength = toInteger(expectedLength);
    if (
      expectedHash === null ||
      !/^[a-f0-9]{64}$/u.test(expectedHash) ||
      mode === null ||
      !['IMAGE_TEXT', 'ARITHMETIC', 'BUTTON_SEQUENCE', 'MODAL_TEXT'].includes(mode) ||
      attemptsRemaining === null ||
      parsedLength === null ||
      progress === null
    ) {
      return null;
    }
    return {
      expectedHash,
      mode: mode as OnboardingCaptchaType,
      attemptsRemaining,
      expectedLength: parsedLength,
      progress,
    };
  }

  async #consumeSuccess(
    guildId: string,
    userId: string,
    challengeId: string,
    expectedHash: string,
  ): Promise<boolean> {
    const result = await this.#redis.eval(
      `
if redis.call('HGET', KEYS[1], 'expectedHash') ~= ARGV[1] then return 0 end
redis.call('DEL', KEYS[1])
redis.call('DEL', KEYS[2])
redis.call('SET', KEYS[3], '1', 'EX', 600)
return 1
`,
      3,
      this.#challengeKey(guildId, userId, challengeId),
      this.#activeKey(guildId, userId),
      this.#consumedKey(guildId, userId, challengeId),
      expectedHash,
    );
    return Number(result) === 1;
  }

  async #recordFailure(
    guildId: string,
    userId: string,
    challengeId: string,
    expectedHash: string,
    lockoutSeconds: number,
    resetProgress = false,
  ): Promise<CaptchaVerifyResult> {
    const result = (await this.#redis.eval(
      `
if redis.call('HGET', KEYS[1], 'expectedHash') ~= ARGV[1] then return {'MISSING', '0'} end
local remaining = redis.call('HINCRBY', KEYS[1], 'attemptsRemaining', -1)
if ARGV[3] == '1' then redis.call('HSET', KEYS[1], 'progress', '') end
if remaining <= 0 then
  redis.call('DEL', KEYS[1])
  redis.call('DEL', KEYS[2])
  redis.call('SET', KEYS[3], '1', 'EX', ARGV[2])
  return {'LOCKED', ARGV[2]}
end
return {'INVALID', tostring(remaining)}
`,
      3,
      this.#challengeKey(guildId, userId, challengeId),
      this.#activeKey(guildId, userId),
      this.#lockKey(guildId, userId),
      expectedHash,
      String(lockoutSeconds),
      resetProgress ? '1' : '0',
    )) as [string, string];
    if (result[0] === 'LOCKED') {
      return { status: 'LOCKED', retryAfterSeconds: Number(result[1]) };
    }
    if (result[0] === 'INVALID') {
      return { status: 'INVALID', attemptsRemaining: Number(result[1]) };
    }
    return this.#missingResult(guildId, userId, challengeId);
  }

  async #missingResult(
    guildId: string,
    userId: string,
    challengeId: string,
  ): Promise<CaptchaVerifyResult> {
    const replayed = await this.#redis.exists(this.#consumedKey(guildId, userId, challengeId));
    if (replayed > 0) return { status: 'REPLAY' };
    const lockTtl = await this.#redis.ttl(this.#lockKey(guildId, userId));
    if (lockTtl > 0) return { status: 'LOCKED', retryAfterSeconds: lockTtl };
    return { status: 'EXPIRED' };
  }

  #answerHash(guildId: string, userId: string, challengeId: string, answer: string): string {
    return createHmac('sha256', this.options.signingSecret)
      .update(`captcha:v1:${guildId}:${userId}:${challengeId}:${answer}`)
      .digest('hex');
  }

  #base(guildId: string, userId: string): string {
    return `${this.options.namespace}:verification:${guildId}:${userId}`;
  }

  #challengeKey(guildId: string, userId: string, challengeId: string): string {
    return `${this.#base(guildId, userId)}:${challengeId}`;
  }

  #activeKey(guildId: string, userId: string): string {
    return `${this.#base(guildId, userId)}:active`;
  }

  #lockKey(guildId: string, userId: string): string {
    return `${this.options.namespace}:verification-lock:${guildId}:${userId}`;
  }

  #userRateKey(guildId: string, userId: string): string {
    return `${this.options.namespace}:verification-rate:user:${guildId}:${userId}`;
  }

  #guildRateKey(guildId: string): string {
    return `${this.options.namespace}:verification-rate:guild:${guildId}`;
  }

  #consumedKey(guildId: string, userId: string, challengeId: string): string {
    return `${this.options.namespace}:verification-consumed:${guildId}:${userId}:${challengeId}`;
  }

  #assertIdentity(guildId: string, userId: string): void {
    if (!SNOWFLAKE.test(guildId) || !SNOWFLAKE.test(userId)) {
      throw new TypeError('Captcha guild and user identifiers must be Discord snowflakes.');
    }
  }

  #assertChallengeIdentity(guildId: string, userId: string, challengeId: string): void {
    this.#assertIdentity(guildId, userId);
    if (!/^[A-Za-z0-9_-]{24}$/u.test(challengeId)) {
      throw new TypeError('Captcha challenge identifier is invalid.');
    }
  }

  async #connect(): Promise<void> {
    if (this.#redis.status === 'wait') await this.#redis.connect();
  }
}
