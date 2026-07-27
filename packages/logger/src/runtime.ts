import {
  createLogger,
  type CreateLoggerOptions,
  type Logger,
  type LoggerBindings,
} from './index.js';

export type CreateRuntimeLoggerOptions = CreateLoggerOptions & {
  pretty?: boolean;
};

export const createRuntimeLogger = async (
  bindings: LoggerBindings,
  options: CreateRuntimeLoggerOptions = {},
): Promise<Logger> => {
  const { pretty = false, ...loggerOptions } = options;
  if (!pretty) return createLogger(bindings, loggerOptions);

  try {
    const { createPrettyLogger } = await import('./pretty.js');
    return createPrettyLogger(bindings, loggerOptions);
  } catch (error) {
    const logger = createLogger(bindings, loggerOptions);
    logger.warn({ err: error }, 'pretty logging is unavailable; using structured logs');
    return logger;
  }
};
