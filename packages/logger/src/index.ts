import pino, { type Logger, type LoggerOptions } from 'pino';

export type LoggerBindings = {
  app: 'api' | 'bot' | 'web' | 'worker' | 'database' | 'test';
  environment: string;
  version?: string;
};

const redactionPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  'headers.cookie',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.clientSecret',
  '*.secret',
  '*.password',
  '*.databaseUrl',
  '*.redisUrl',
  'DISCORD_BOT_TOKEN',
  'DISCORD_CLIENT_SECRET',
  'AUTH_SECRET',
  'INTERNAL_API_SECRET',
  'ENCRYPTION_KEY',
] as const;

export const createLogger = (
  bindings: LoggerBindings,
  options: {
    level?: string;
    pretty?: boolean;
    destination?: pino.DestinationStream;
  } = {},
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

  if (options.pretty === true && options.destination === undefined) {
    return pino(
      loggerOptions,
      pino.transport({
        target: 'pino-pretty',
        options: { colorize: true, singleLine: true, translateTime: 'SYS:standard' },
      }),
    );
  }
  return pino(loggerOptions, options.destination);
};

export type { Logger } from 'pino';
