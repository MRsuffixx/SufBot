import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyInternalRequest } from '@sufbot/auth';
import { AuthenticationError, sha256 } from '@sufbot/shared';
import type { ApiDependencies } from './types.js';

const header = (request: FastifyRequest, name: string): string => {
  const value = request.headers[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new AuthenticationError(`Missing internal authentication header: ${name}.`);
  }
  return value;
};

export const createInternalAuthenticator =
  (dependencies: ApiDependencies) =>
  async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const body = request.body === undefined ? '' : JSON.stringify(request.body);
    const timestamp = header(request, 'x-sufbot-timestamp');
    const nonce = header(request, 'x-sufbot-nonce');
    const signature = header(request, 'x-sufbot-signature');
    await verifyInternalRequest(
      dependencies.env.INTERNAL_API_SECRET,
      request.method,
      request.url,
      body,
      { timestamp, nonce, signature },
      {
        claim: (value, ttlSeconds) =>
          dependencies.cache.claimOnce('internal-request', sha256(value), ttlSeconds),
      },
      { maxAgeSeconds: dependencies.config.security.internalRequestMaxAgeSeconds },
    );
  };
