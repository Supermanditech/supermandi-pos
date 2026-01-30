// V3.0.9: Standard error envelope - ALL services MUST use this
// GO-LIVE-182: Enhanced with diagnostic capabilities

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: string[];
    field?: string;
    // GO-LIVE-182: Optional diagnostic info for debugging
    diagnostic?: string;
  };
  requestId: string;
}

// GO-LIVE-182: Extended options for better diagnostics
export interface ApiErrorOptions {
  details?: string[];
  field?: string;
  cause?: Error | unknown;
  diagnostic?: string;
  context?: Record<string, unknown>;
}

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: string[];
  public readonly field?: string;
  // GO-LIVE-182: Additional diagnostic fields
  public readonly diagnostic?: string;
  public readonly context?: Record<string, unknown>;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    options?: ApiErrorOptions
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = options?.details;
    this.field = options?.field;
    this.diagnostic = options?.diagnostic;
    this.context = options?.context;

    // Preserve original error stack if available
    if (options?.cause instanceof Error && options.cause.stack) {
      this.stack = `${this.stack}\nCaused by: ${options.cause.stack}`;
    }
  }

  toResponse(requestId: string): ApiErrorResponse {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
        ...(this.field && { field: this.field }),
        // GO-LIVE-182: Include diagnostic in non-production for debugging
        ...(this.diagnostic && process.env.NODE_ENV !== 'production' && { diagnostic: this.diagnostic }),
      },
      requestId,
    };
  }

  // GO-LIVE-182: Get full diagnostic string for logging
  toDiagnosticString(): string {
    const parts = [
      `[${this.code}] ${this.message}`,
      `HTTP ${this.statusCode}`,
    ];

    if (this.field) parts.push(`Field: ${this.field}`);
    if (this.diagnostic) parts.push(`Diagnostic: ${this.diagnostic}`);
    if (this.details?.length) parts.push(`Details: ${this.details.join(', ')}`);
    if (this.context) parts.push(`Context: ${JSON.stringify(this.context)}`);

    return parts.join(' | ');
  }

  // Factory methods for common errors
  static badRequest(message: string, field?: string) {
    return new ApiError(400, 'VALIDATION_ERROR', message, { field });
  }

  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'Insufficient permissions') {
    return new ApiError(403, 'FORBIDDEN', message);
  }

  static notFound(resource: string) {
    return new ApiError(404, 'NOT_FOUND', `${resource} not found`);
  }

  static conflict(code: string, message: string) {
    return new ApiError(409, code, message);
  }

  static internal(message = 'Internal server error') {
    return new ApiError(500, 'INTERNAL_ERROR', message);
  }

  // GO-LIVE-182: Factory methods with diagnostic context

  /**
   * Create a validation error with detailed field context
   */
  static validationError(
    message: string,
    options: { field?: string; expected?: string; received?: string; details?: string[] }
  ) {
    const diagnostic = options.expected && options.received
      ? `Expected ${options.expected}, received ${options.received}`
      : undefined;

    return new ApiError(400, 'VALIDATION_ERROR', message, {
      field: options.field,
      details: options.details,
      diagnostic,
    });
  }

  /**
   * Create a database error with operation context
   */
  static databaseError(
    operation: string,
    cause: Error | unknown,
    table?: string
  ) {
    const causeMessage = cause instanceof Error ? cause.message : String(cause);
    const causeCode = (cause as { code?: string })?.code;

    const diagnostic = [
      `Operation: ${operation}`,
      table && `Table: ${table}`,
      causeCode && `DB Code: ${causeCode}`,
    ].filter(Boolean).join(', ');

    // Log the full error for debugging
    console.error(`[GO-LIVE-182] Database error in ${operation}:`, {
      table,
      code: causeCode,
      message: causeMessage,
    });

    return new ApiError(500, 'DATABASE_ERROR', 'Database operation failed', {
      cause,
      diagnostic,
      context: { operation, table, dbCode: causeCode },
    });
  }

  /**
   * Create a service unavailable error with context
   */
  static serviceUnavailable(
    serviceName: string,
    reason?: string,
    retryAfter?: number
  ) {
    const diagnostic = [
      `Service: ${serviceName}`,
      reason && `Reason: ${reason}`,
      retryAfter && `Retry after: ${retryAfter}s`,
    ].filter(Boolean).join(', ');

    return new ApiError(503, 'SERVICE_UNAVAILABLE', `${serviceName} is currently unavailable`, {
      diagnostic,
      context: { serviceName, reason, retryAfter },
    });
  }

  /**
   * Create a timeout error
   */
  static timeout(operation: string, timeoutMs: number) {
    return new ApiError(408, 'TIMEOUT', `Operation timed out`, {
      diagnostic: `${operation} exceeded ${timeoutMs}ms`,
      context: { operation, timeoutMs },
    });
  }

  /**
   * Create a rate limit error
   */
  static rateLimited(resource: string, retryAfter?: number) {
    return new ApiError(429, 'RATE_LIMITED', `Too many requests for ${resource}`, {
      diagnostic: retryAfter ? `Retry after ${retryAfter}s` : undefined,
      context: { resource, retryAfter },
    });
  }
}
