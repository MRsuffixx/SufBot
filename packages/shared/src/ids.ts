import { randomBytes, randomUUID } from 'node:crypto';

const PREFIX_PATTERN = /^[a-z][a-z0-9_]{1,15}$/;

export const createId = (prefix: string): string => {
  if (!PREFIX_PATTERN.test(prefix)) {
    throw new TypeError('ID prefix must be a lowercase identifier.');
  }
  return `${prefix}_${randomUUID().replaceAll('-', '')}`;
};

export const createOpaqueToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

export const discordSnowflakePattern = /^\d{17,20}$/;

export const isDiscordSnowflake = (value: string): boolean => discordSnowflakePattern.test(value);

