import { constantTimeEqual, createOpaqueToken, sha256 } from '@sufbot/shared';
import type { BillingProviderName } from './contracts.js';

export type CheckoutNonce = {
  nonce: string;
  nonceHash: string;
};

export const createCheckoutNonce = (): CheckoutNonce => {
  const nonce = createOpaqueToken(32);
  return { nonce, nonceHash: sha256(nonce) };
};

export const verifyCheckoutNonce = (nonce: string, expectedHash: string): boolean => {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(expectedHash)) {
    return false;
  }
  return constantTimeEqual(sha256(nonce), expectedHash);
};

export const createBillingIdempotencyKey = (
  provider: BillingProviderName,
  operation: string,
  internalReference: string,
  periodReference?: string,
): string => {
  if (!/^[a-z][a-z0-9._-]{1,63}$/.test(operation)) {
    throw new TypeError('Billing idempotency operation is invalid.');
  }
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(internalReference)) {
    throw new TypeError('Billing idempotency reference is invalid.');
  }
  if (periodReference !== undefined && !/^[A-Za-z0-9:._-]{1,64}$/.test(periodReference)) {
    throw new TypeError('Billing period reference is invalid.');
  }
  return sha256([provider, operation, internalReference, periodReference ?? 'initial'].join(':'));
};

const providerSecretPattern =
  /(sk_(?:test|live)_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+|merchant_(?:key|salt)\s*[=:]\s*\S+|ctoken\s*[=:]\s*\S+|utoken\s*[=:]\s*\S+)/gi;

export const sanitizeProviderMessage = (message: string, maxLength = 500): string =>
  message
    .replace(providerSecretPattern, '[REDACTED]')
    .replaceAll(/[\r\n\t]+/g, ' ')
    .slice(0, maxLength);
