export type ErrorDetails = Readonly<Record<string, unknown>>;

export type AppErrorOptions = {
  code: string;
  message: string;
  statusCode: number;
  details?: ErrorDetails;
  cause?: unknown;
  expose?: boolean;
};

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: ErrorDetails;
  public readonly expose: boolean;

  public constructor(options: AppErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = this.constructor.name;
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.expose = options.expose ?? options.statusCode < 500;
    if (options.details !== undefined) {
      this.details = options.details;
    }
  }
}

export class ValidationError extends AppError {
  public constructor(message = 'The request is invalid.', details?: ErrorDetails) {
    super({ code: 'VALIDATION_ERROR', message, statusCode: 400, details });
  }
}

export class AuthenticationError extends AppError {
  public constructor(message = 'Authentication is required.') {
    super({ code: 'AUTHENTICATION_REQUIRED', message, statusCode: 401 });
  }
}

export class AuthorizationError extends AppError {
  public constructor(
    message = 'You do not have permission to perform this action.',
    code = 'ACCESS_DENIED',
  ) {
    super({ code, message, statusCode: 403 });
  }
}

export class NotFoundError extends AppError {
  public constructor(resource = 'Resource') {
    super({ code: 'NOT_FOUND', message: `${resource} was not found.`, statusCode: 404 });
  }
}

export class ConflictError extends AppError {
  public constructor(message = 'The request conflicts with current state.') {
    super({ code: 'CONFLICT', message, statusCode: 409 });
  }
}

export class RateLimitError extends AppError {
  public constructor(message = 'Too many requests. Try again later.') {
    super({ code: 'RATE_LIMITED', message, statusCode: 429 });
  }
}

export class InternalServiceError extends AppError {
  public constructor(code = 'INTERNAL_ERROR', message = 'An internal service failed.', cause?: unknown) {
    super({ code, message, statusCode: 503, cause, expose: false });
  }
}

export class DatabaseError extends InternalServiceError {
  public constructor(cause?: unknown) {
    super('DATABASE_UNAVAILABLE', 'The database is temporarily unavailable.', cause);
  }
}

export class DiscordApiError extends InternalServiceError {
  public constructor(message = 'Discord could not complete the request.', cause?: unknown) {
    super('DISCORD_API_ERROR', message, cause);
  }
}

export const isAppError = (error: unknown): error is AppError => error instanceof AppError;

export const toSafeError = (
  error: unknown,
  requestId: string,
): {
  success: false;
  error: { code: string; message: string; requestId: string; details?: ErrorDetails };
} => {
  const appError = isAppError(error)
    ? error
    : new AppError({
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
        statusCode: 500,
        cause: error,
        expose: false,
      });

  const payload: {
    code: string;
    message: string;
    requestId: string;
    details?: ErrorDetails;
  } = {
    code: appError.code,
    message: appError.expose ? appError.message : 'An unexpected error occurred.',
    requestId,
  };
  if (appError.expose && appError.details !== undefined) {
    payload.details = appError.details;
  }
  return { success: false, error: payload };
};

