import pinoPretty from 'pino-pretty';
import {
  createLogger,
  type CreateLoggerOptions,
  type Logger,
  type LoggerBindings,
} from './index.js';

export type CreatePrettyLoggerOptions = Omit<CreateLoggerOptions, 'destination'>;

export const createPrettyLogger = (
  bindings: LoggerBindings,
  options: CreatePrettyLoggerOptions = {},
): Logger => {
  const destination = pinoPretty({
    colorize: process.stdout.isTTY === true,
    singleLine: true,
    translateTime: 'SYS:standard',
    ignore: 'pid,hostname',
  });
  return createLogger(bindings, { ...options, destination });
};
