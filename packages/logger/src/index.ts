import pino, { type Logger, type LoggerOptions } from 'pino';

export type DestinationStream = pino.DestinationStream;

export type LoggerBindings = {
  app: 'api' | 'bot' | 'web' | 'worker' | 'database' | 'test';
  environment: string;
  version?: string;
};

export type CreateLoggerOptions = {
  level?: string;
  destination?: DestinationStream;
};

const redactionPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  'headers.cookie',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.access_token',
  '*.refresh_token',
  '*.apiKey',
  '*.clientSecret',
  '*.secret',
  '*.password',
  '*.databaseUrl',
  '*.redisUrl',
  '*.connectionString',
  'DISCORD_BOT_TOKEN',
  'DISCORD_CLIENT_SECRET',
  'AUTH_SECRET',
  'INTERNAL_API_SECRET',
  'WEBHOOK_SIGNING_SECRET',
  'ENCRYPTION_KEY',
  'SESSION_ENCRYPTION_KEY',
  'DATABASE_URL',
  'DIRECT_DATABASE_URL',
  'TEST_DATABASE_URL',
  'REDIS_URL',
] as const;

export const createLogger = (
  bindings: LoggerBindings,
  options: CreateLoggerOptions = {},
): Logger => {
  const loggerOptions: LoggerOptions = {
    level: options.level ?? 'info',
    base: bindings,
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [...redactionPaths],
      censor: '[REDACTED]',
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
    serializers: {
      err: pino.stdSerializers.err,
      req: (request: {
        id?: string;
        method?: string;
        url?: string;
        headers?: Record<string, unknown>;
        remoteAddress?: string;
      }) => ({
        id: request.id,
        method: request.method,
        url: request.url,
        remoteAddress: request.remoteAddress,
      }),
    },
  };

  return pino(loggerOptions, options.destination);
};

export type { Logger } from 'pino';
