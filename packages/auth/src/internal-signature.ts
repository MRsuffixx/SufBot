import {
  AuthorizationError,
  constantTimeEqual,
  hmacSha256,
  sha256,
} from '@sufbot/shared';

export type SignedRequestFields = {
  timestamp: string;
  nonce: string;
  signature: string;
};

export interface ReplayStore {
  claim(nonce: string, ttlSeconds: number): Promise<boolean>;
}

export const canonicalRequest = (
  method: string,
  path: string,
  body: string,
  timestamp: string,
  nonce: string,
): string => [timestamp, nonce, method.toUpperCase(), path, sha256(body)].join('\n');

export const signInternalRequest = (
  secret: string,
  method: string,
  path: string,
  body: string,
  timestamp: string,
  nonce: string,
): string => hmacSha256(secret, canonicalRequest(method, path, body, timestamp, nonce));

export const verifyInternalRequest = async (
  secret: string,
  method: string,
  path: string,
  body: string,
  fields: SignedRequestFields,
  replayStore: ReplayStore,
  options: { now?: Date; maxAgeSeconds: number },
): Promise<void> => {
  const timestamp = Date.parse(fields.timestamp);
  const now = options.now?.getTime() ?? Date.now();
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > options.maxAgeSeconds * 1000) {
    throw new AuthorizationError('Internal request timestamp is invalid.', 'INTERNAL_TIMESTAMP_INVALID');
  }
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(fields.nonce)) {
    throw new AuthorizationError('Internal request nonce is invalid.', 'INTERNAL_NONCE_INVALID');
  }
  const expected = signInternalRequest(
    secret,
    method,
    path,
    body,
    fields.timestamp,
    fields.nonce,
  );
  if (!constantTimeEqual(expected, fields.signature)) {
    throw new AuthorizationError('Internal request signature is invalid.', 'INTERNAL_SIGNATURE_INVALID');
  }
  if (!(await replayStore.claim(fields.nonce, options.maxAgeSeconds * 2))) {
    throw new AuthorizationError('Internal request replay was rejected.', 'INTERNAL_REPLAY_REJECTED');
  }
};

