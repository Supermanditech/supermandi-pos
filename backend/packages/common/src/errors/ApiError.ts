// V3.0.9: Standard error envelope - ALL services MUST use this

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: string[];
    field?: string;
  };
  requestId: string;
}

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: string[];
  public readonly field?: string;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    options?: { details?: string[]; field?: string }
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = options?.details;
    this.field = options?.field;
  }

  toResponse(requestId: string): ApiErrorResponse {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
        ...(this.field && { field: this.field }),
      },
      requestId,
    };
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
}
