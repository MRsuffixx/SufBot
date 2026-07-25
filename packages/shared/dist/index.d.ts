import { z } from 'zod';

declare const sha256: (value: string) => string;
declare const hmacSha256: (secret: string, value: string) => string;
declare const constantTimeEqual: (left: string, right: string) => boolean;
declare const encryptString: (plaintext: string, encodedKey: string) => string;
declare const decryptString: (envelope: string, encodedKey: string) => string;

type ErrorDetails = Readonly<Record<string, unknown>>;
type AppErrorOptions = {
    code: string;
    message: string;
    statusCode: number;
    details?: ErrorDetails;
    cause?: unknown;
    expose?: boolean;
};
declare class AppError extends Error {
    readonly code: string;
    readonly statusCode: number;
    readonly details?: ErrorDetails;
    readonly expose: boolean;
    constructor(options: AppErrorOptions);
}
declare class ValidationError extends AppError {
    constructor(message?: string, details?: ErrorDetails);
}
declare class AuthenticationError extends AppError {
    constructor(message?: string);
}
declare class AuthorizationError extends AppError {
    constructor(message?: string, code?: string);
}
declare class NotFoundError extends AppError {
    constructor(resource?: string);
}
declare class ConflictError extends AppError {
    constructor(message?: string);
}
declare class RateLimitError extends AppError {
    constructor(message?: string);
}
declare class InternalServiceError extends AppError {
    constructor(code?: string, message?: string, cause?: unknown);
}
declare class DatabaseError extends InternalServiceError {
    constructor(cause?: unknown);
}
declare class DiscordApiError extends InternalServiceError {
    constructor(message?: string, cause?: unknown);
}
declare const isAppError: (error: unknown) => error is AppError;
declare const toSafeError: (error: unknown, requestId: string) => {
    success: false;
    error: {
        code: string;
        message: string;
        requestId: string;
        details?: ErrorDetails;
    };
};

declare const DiscordSnowflakeSchema: z.ZodString;
declare const LocaleSchema: z.ZodEnum<{
    en: "en";
    tr: "tr";
}>;
type Locale = z.infer<typeof LocaleSchema>;
declare const PaginationSchema: z.ZodObject<{
    cursor: z.ZodOptional<z.ZodString>;
    page: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
declare const SortDirectionSchema: z.ZodDefault<z.ZodEnum<{
    asc: "asc";
    desc: "desc";
}>>;
declare const RequestIdSchema: z.ZodString;
declare const GuildSettingsInputSchema: z.ZodObject<{
    locale: z.ZodOptional<z.ZodEnum<{
        en: "en";
        tr: "tr";
    }>>;
    timezone: z.ZodOptional<z.ZodString>;
    commandPrefix: z.ZodOptional<z.ZodString>;
    expectedVersion: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
declare const GuildModuleInputSchema: z.ZodObject<{
    enabled: z.ZodBoolean;
    config: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    expectedVersion: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
type GuildSettingsInput = z.infer<typeof GuildSettingsInputSchema>;
type GuildModuleInput = z.infer<typeof GuildModuleInputSchema>;

declare const english: {
    "errors.unknown": string;
    "errors.guildOnly": string;
    "errors.permissionDenied": string;
    "errors.moduleDisabled": string;
    "commands.ping.response": string;
    "commands.config.languageUpdated": string;
    "commands.timeout.success": string;
    "common.saved": string;
    "common.cancelled": string;
};
type MessageKey = keyof typeof english;
declare const translate: (locale: Locale, key: MessageKey, variables?: Readonly<Record<string, string | number>>) => string;
declare const isSupportedMessageKey: (key: string) => key is MessageKey;

declare const createId: (prefix: string) => string;
declare const createOpaqueToken: (bytes?: number) => string;
declare const discordSnowflakePattern: RegExp;
declare const isDiscordSnowflake: (value: string) => boolean;

export { AppError, type AppErrorOptions, AuthenticationError, AuthorizationError, ConflictError, DatabaseError, DiscordApiError, DiscordSnowflakeSchema, type ErrorDetails, type GuildModuleInput, GuildModuleInputSchema, type GuildSettingsInput, GuildSettingsInputSchema, InternalServiceError, type Locale, LocaleSchema, NotFoundError, PaginationSchema, RateLimitError, RequestIdSchema, SortDirectionSchema, ValidationError, constantTimeEqual, createId, createOpaqueToken, decryptString, discordSnowflakePattern, encryptString, hmacSha256, isAppError, isDiscordSnowflake, isSupportedMessageKey, sha256, toSafeError, translate };
