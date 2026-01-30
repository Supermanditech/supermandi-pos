// Standardized Error Handler Middleware - GO-LIVE-055
// Consistent error response format across all services

import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ApiError } from '../errors/ApiError';
import { ERROR_CODES } from '../errors/errorCodes';
import { Logger, createLogger } from '../logging/logger';

// =============================================================================
// TYPES
// =============================================================================

export interface ErrorHandlerOptions {
  /** Logger instance */
  logger?: Logger;
  /** Service name for logging */
  service?: string;
  /** Include stack trace in response (only in development) */
  includeStack?: boolean;
  /** Custom error transformer */
  transformError?: (error: Error) => { statusCode: number; code: string; message: string };
}

// =============================================================================
// STANDARD ERROR RESPONSE FORMAT
// =============================================================================

export interface StandardErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
    field?: string;
  };
  requestId?: string;
  timestamp: string;
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * GO-LIVE-055: Standardized error handler middleware
 * Ensures all errors follow the same response format:
 * {
 *   error: { code: string, message: string, details?: any, field?: string },
 *   requestId: string,
 *   timestamp: string
 * }
 */
export function errorHandler(options: ErrorHandlerOptions = {}): ErrorRequestHandler {
  const {
    service = process.env.SERVICE_NAME || 'supermandi',
    includeStack = process.env.NODE_ENV === 'development',
  } = options;

  const logger = options.logger || createLogger({ service });

  return (
    err: Error,
    req: Request,
    res: Response,
    _next: NextFunction
  ): void => {
    // Don't send response if headers already sent
    if (res.headersSent) {
      logger.error('Error after headers sent', err, {
        correlationId: req.correlationId,
        requestId: req.requestId,
        method: req.method,
        path: req.path,
      });
      return;
    }

    const correlationId = req.correlationId || req.requestId;
    const timestamp = new Date().toISOString();

    // Handle ApiError (known application errors)
    if (err instanceof ApiError) {
      logger.warn('API error', {
        correlationId,
        statusCode: err.statusCode,
        code: err.code,
        message: err.message,
        field: err.field,
        method: req.method,
        path: req.path,
      });

      const response: StandardErrorResponse = {
        error: {
          code: err.code,
          message: err.message,
          ...(err.details && { details: err.details }),
          ...(err.field && { field: err.field }),
        },
        requestId: correlationId,
        timestamp,
      };

      res.status(err.statusCode).json(response);
      return;
    }

    // Handle validation errors (e.g., from express-validator or Zod)
    if (err.name === 'ValidationError' || err.name === 'ZodError') {
      logger.warn('Validation error', {
        correlationId,
        message: err.message,
        method: req.method,
        path: req.path,
      });

      const response: StandardErrorResponse = {
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: err.message,
        },
        requestId: correlationId,
        timestamp,
      };

      res.status(400).json(response);
      return;
    }

    // Handle JSON syntax errors
    if (err instanceof SyntaxError && 'body' in err) {
      logger.warn('JSON parse error', {
        correlationId,
        message: err.message,
        method: req.method,
        path: req.path,
      });

      const response: StandardErrorResponse = {
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'Invalid JSON in request body',
        },
        requestId: correlationId,
        timestamp,
      };

      res.status(400).json(response);
      return;
    }

    // Custom error transformer
    if (options.transformError) {
      try {
        const transformed = options.transformError(err);
        logger.warn('Transformed error', {
          correlationId,
          statusCode: transformed.statusCode,
          code: transformed.code,
          message: transformed.message,
          method: req.method,
          path: req.path,
        });

        const response: StandardErrorResponse = {
          error: {
            code: transformed.code,
            message: transformed.message,
          },
          requestId: correlationId,
          timestamp,
        };

        res.status(transformed.statusCode).json(response);
        return;
      } catch {
        // Fall through to generic error handling
      }
    }

    // Log unknown errors with full details
    logger.error('Unhandled error', err, {
      correlationId,
      method: req.method,
      path: req.path,
      query: req.query,
      userAgent: req.headers['user-agent'],
      ip: req.ip || req.connection.remoteAddress,
    });

    // Generic 500 error response
    const response: StandardErrorResponse = {
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'An unexpected error occurred',
        ...(includeStack && { details: { stack: err.stack } }),
      },
      requestId: correlationId,
      timestamp,
    };

    res.status(500).json(response);
  };
}

/**
 * GO-LIVE-055: 404 Not Found handler
 * Standard format for unknown routes.
 */
export function notFoundHandler(): (req: Request, res: Response) => void {
  return (req: Request, res: Response): void => {
    const response: StandardErrorResponse = {
      error: {
        code: ERROR_CODES.NOT_FOUND,
        message: `Route ${req.method} ${req.path} not found`,
      },
      requestId: req.correlationId || req.requestId,
      timestamp: new Date().toISOString(),
    };

    res.status(404).json(response);
  };
}

export default errorHandler;
