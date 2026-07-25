import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  timingSafeEqual,
} from 'node:crypto';

const ENCRYPTION_VERSION = 'v1';

export const sha256 = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

export const hmacSha256 = (secret: string, value: string): string =>
  createHmac('sha256', secret).update(value, 'utf8').digest('base64url');

export const constantTimeEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    timingSafeEqual(leftBuffer, leftBuffer);
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
};

const decodeEncryptionKey = (encodedKey: string): Buffer => {
  const key = Buffer.from(encodedKey, 'base64');
  if (key.length !== 32) {
    throw new TypeError('Encryption key must be a base64-encoded 32-byte value.');
  }
  return key;
};

export const encryptString = (plaintext: string, encodedKey: string): string => {
  const key = decodeEncryptionKey(encodedKey);
  const iv = Buffer.from(crypto.getRandomValues(new Uint8Array(12)));
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    ENCRYPTION_VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
};

export const decryptString = (envelope: string, encodedKey: string): string => {
  const [version, ivText, tagText, ciphertextText] = envelope.split('.');
  if (
    version !== ENCRYPTION_VERSION ||
    ivText === undefined ||
    tagText === undefined ||
    ciphertextText === undefined
  ) {
    throw new TypeError('Encrypted value has an unsupported format.');
  }
  const key = decodeEncryptionKey(encodedKey);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
};
