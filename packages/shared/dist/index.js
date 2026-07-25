// src/crypto.ts
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  timingSafeEqual
} from "crypto";
var ENCRYPTION_VERSION = "v1";
var sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");
var hmacSha256 = (secret, value) => createHmac("sha256", secret).update(value, "utf8").digest("base64url");
var constantTimeEqual = (left, right) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    timingSafeEqual(leftBuffer, leftBuffer);
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
};
var decodeEncryptionKey = (encodedKey) => {
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) {
    throw new TypeError("Encryption key must be a base64-encoded 32-byte value.");
  }
  return key;
};
var encryptString = (plaintext, encodedKey) => {
  const key = decodeEncryptionKey(encodedKey);
  const iv = Buffer.from(crypto.getRandomValues(new Uint8Array(12)));
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [ENCRYPTION_VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(
    "."
  );
};
var decryptString = (envelope, encodedKey) => {
  const [version, ivText, tagText, ciphertextText] = envelope.split(".");
  if (version !== ENCRYPTION_VERSION || ivText === void 0 || tagText === void 0 || ciphertextText === void 0) {
    throw new TypeError("Encrypted value has an unsupported format.");
  }
  const key = decodeEncryptionKey(encodedKey);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, "base64url")),
    decipher.final()
  ]).toString("utf8");
};

// src/errors.ts
var AppError = class extends Error {
  code;
  statusCode;
  details;
  expose;
  constructor(options) {
    super(options.message, { cause: options.cause });
    this.name = this.constructor.name;
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.expose = options.expose ?? options.statusCode < 500;
    if (options.details !== void 0) {
      this.details = options.details;
    }
  }
};
var ValidationError = class extends AppError {
  constructor(message = "The request is invalid.", details) {
    super({
      code: "VALIDATION_ERROR",
      message,
      statusCode: 400,
      ...details === void 0 ? {} : { details }
    });
  }
};
var AuthenticationError = class extends AppError {
  constructor(message = "Authentication is required.") {
    super({ code: "AUTHENTICATION_REQUIRED", message, statusCode: 401 });
  }
};
var AuthorizationError = class extends AppError {
  constructor(message = "You do not have permission to perform this action.", code = "ACCESS_DENIED") {
    super({ code, message, statusCode: 403 });
  }
};
var NotFoundError = class extends AppError {
  constructor(resource = "Resource") {
    super({ code: "NOT_FOUND", message: `${resource} was not found.`, statusCode: 404 });
  }
};
var ConflictError = class extends AppError {
  constructor(message = "The request conflicts with current state.") {
    super({ code: "CONFLICT", message, statusCode: 409 });
  }
};
var RateLimitError = class extends AppError {
  constructor(message = "Too many requests. Try again later.") {
    super({ code: "RATE_LIMITED", message, statusCode: 429 });
  }
};
var InternalServiceError = class extends AppError {
  constructor(code = "INTERNAL_ERROR", message = "An internal service failed.", cause) {
    super({
      code,
      message,
      statusCode: 503,
      ...cause === void 0 ? {} : { cause },
      expose: false
    });
  }
};
var DatabaseError = class extends InternalServiceError {
  constructor(cause) {
    super("DATABASE_UNAVAILABLE", "The database is temporarily unavailable.", cause);
  }
};
var DiscordApiError = class extends InternalServiceError {
  constructor(message = "Discord could not complete the request.", cause) {
    super("DISCORD_API_ERROR", message, cause);
  }
};
var isAppError = (error) => error instanceof AppError;
var toSafeError = (error, requestId) => {
  const appError = isAppError(error) ? error : new AppError({
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred.",
    statusCode: 500,
    cause: error,
    expose: false
  });
  const payload = {
    code: appError.code,
    message: appError.expose ? appError.message : "An unexpected error occurred.",
    requestId
  };
  if (appError.expose && appError.details !== void 0) {
    payload.details = appError.details;
  }
  return { success: false, error: payload };
};

// src/locales/en/common.json
var common_default = {
  "common.saved": "Your changes were saved.",
  "common.cancelled": "The operation was cancelled."
};

// src/locales/en/commands.json
var commands_default = {
  "commands.ping.response": "Pong! Gateway: {gateway} ms \xB7 Round trip: {roundtrip} ms",
  "commands.config.languageUpdated": "Server language changed to English.",
  "commands.timeout.success": "{user} was timed out for {minutes} minute(s)."
};

// src/locales/en/errors.json
var errors_default = {
  "errors.unknown": "Something went wrong. Reference: {reference}",
  "errors.guildOnly": "This command can only be used in a server.",
  "errors.permissionDenied": "You do not have permission to use this command.",
  "errors.moduleDisabled": "The {module} module is disabled in this server."
};

// src/locales/tr/common.json
var common_default2 = {
  "common.saved": "De\u011Fi\u015Fiklikleriniz kaydedildi.",
  "common.cancelled": "\u0130\u015Flem iptal edildi."
};

// src/locales/tr/commands.json
var commands_default2 = {
  "commands.ping.response": "Pong! A\u011F ge\xE7idi: {gateway} ms \xB7 Gidi\u015F d\xF6n\xFC\u015F: {roundtrip} ms",
  "commands.config.languageUpdated": "Sunucu dili T\xFCrk\xE7e olarak de\u011Fi\u015Ftirildi.",
  "commands.timeout.success": "{user} kullan\u0131c\u0131s\u0131na {minutes} dakika zaman a\u015F\u0131m\u0131 uyguland\u0131."
};

// src/locales/tr/errors.json
var errors_default2 = {
  "errors.unknown": "Bir hata olu\u015Ftu. Referans: {reference}",
  "errors.guildOnly": "Bu komut yaln\u0131zca bir sunucuda kullan\u0131labilir.",
  "errors.permissionDenied": "Bu komutu kullanma izniniz yok.",
  "errors.moduleDisabled": "Bu sunucuda {module} mod\xFCl\xFC devre d\u0131\u015F\u0131."
};

// src/i18n.ts
var english = { ...common_default, ...commands_default, ...errors_default };
var messages = {
  en: english,
  tr: { ...common_default2, ...commands_default2, ...errors_default2 }
};
var translate = (locale, key, variables = {}) => {
  const template = messages[locale][key] ?? messages.en[key];
  return Object.entries(variables).reduce(
    (rendered, [name, value]) => rendered.replaceAll(`{${name}}`, String(value)),
    template
  );
};
var isSupportedMessageKey = (key) => key in messages.en;

// src/ids.ts
import { randomBytes, randomUUID } from "crypto";
var PREFIX_PATTERN = /^[a-z][a-z0-9_]{1,15}$/;
var createId = (prefix) => {
  if (!PREFIX_PATTERN.test(prefix)) {
    throw new TypeError("ID prefix must be a lowercase identifier.");
  }
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
};
var createOpaqueToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
var discordSnowflakePattern = /^\d{17,20}$/;
var isDiscordSnowflake = (value) => discordSnowflakePattern.test(value);

// src/schemas.ts
import { z } from "zod";
var DiscordSnowflakeSchema = z.string().regex(discordSnowflakePattern);
var LocaleSchema = z.enum(["en", "tr"]);
var PaginationSchema = z.object({
  cursor: z.string().min(1).max(128).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});
var SortDirectionSchema = z.enum(["asc", "desc"]).default("desc");
var RequestIdSchema = z.string().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/);
var GuildSettingsInputSchema = z.object({
  locale: LocaleSchema.optional(),
  timezone: z.string().min(1).max(64).optional(),
  commandPrefix: z.string().min(1).max(5).optional(),
  expectedVersion: z.number().int().min(1).optional()
}).strict().refine(
  (input) => input.locale !== void 0 || input.timezone !== void 0 || input.commandPrefix !== void 0,
  "At least one setting must be supplied."
);
var GuildModuleInputSchema = z.object({
  enabled: z.boolean(),
  config: z.record(z.string(), z.unknown()).default({}),
  expectedVersion: z.number().int().min(1).optional()
}).strict();
export {
  AppError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  DatabaseError,
  DiscordApiError,
  DiscordSnowflakeSchema,
  GuildModuleInputSchema,
  GuildSettingsInputSchema,
  InternalServiceError,
  LocaleSchema,
  NotFoundError,
  PaginationSchema,
  RateLimitError,
  RequestIdSchema,
  SortDirectionSchema,
  ValidationError,
  constantTimeEqual,
  createId,
  createOpaqueToken,
  decryptString,
  discordSnowflakePattern,
  encryptString,
  hmacSha256,
  isAppError,
  isDiscordSnowflake,
  isSupportedMessageKey,
  sha256,
  toSafeError,
  translate
};
//# sourceMappingURL=index.js.map