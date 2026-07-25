// src/index.ts
import pino from "pino";
var redactionPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "headers.authorization",
  "headers.cookie",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
  "*.clientSecret",
  "*.secret",
  "*.password",
  "*.databaseUrl",
  "*.redisUrl",
  "DISCORD_BOT_TOKEN",
  "DISCORD_CLIENT_SECRET",
  "AUTH_SECRET",
  "INTERNAL_API_SECRET",
  "ENCRYPTION_KEY"
];
var createLogger = (bindings, options = {}) => {
  const loggerOptions = {
    level: options.level ?? "info",
    base: bindings,
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [...redactionPaths],
      censor: "[REDACTED]"
    },
    formatters: {
      level: (label) => ({ level: label })
    },
    serializers: {
      err: pino.stdSerializers.err,
      req: (request) => ({
        id: request.id,
        method: request.method,
        url: request.url,
        remoteAddress: request.remoteAddress
      })
    }
  };
  if (options.pretty === true && options.destination === void 0) {
    return pino(
      loggerOptions,
      pino.transport({
        target: "pino-pretty",
        options: { colorize: true, singleLine: true, translateTime: "SYS:standard" }
      })
    );
  }
  return pino(loggerOptions, options.destination);
};
export {
  createLogger
};
//# sourceMappingURL=index.js.map