import { headers } from 'next/headers';
import { AuthorizationError } from '@sufbot/shared';
import { appConfig, webEnvironment } from './runtime';

export const validateMutationOrigin = async (): Promise<void> => {
  const requestHeaders = await headers();
  const origin = requestHeaders.get('origin');
  if (origin === null) {
    if (webEnvironment.NODE_ENV === 'production') {
      throw new AuthorizationError('Request origin is missing.', 'CSRF_ORIGIN_MISSING');
    }
    return;
  }
  const allowed = new Set([
    appConfig.application.websiteUrl,
    ...appConfig.server.corsAllowedOrigins,
  ]);
  if (!allowed.has(origin)) {
    throw new AuthorizationError('Request origin is not allowed.', 'CSRF_ORIGIN_DENIED');
  }
};
