// Request Logger Middleware - V3.0.9 compliant
// Express middleware for request/response logging with correlation ID

import { Request, Response, NextFunction, RequestHandler } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Logger, createLogger } from './logger';

// =============================================================================
// TYPES
// =============================================================================

export interface RequestLoggerOptions {
  logger?: Logger;
  service?: string;
  /** Skip logging for these paths (e.g., health checks) */
  skipPaths?: string[];
  /** Log request body (be careful with sensitive data) */
  logBody?: boolean;
  /** Log response body (be careful with sensitive data) */
  logResponseBody?: boolean;
  /** Maximum body length to log */
  maxBodyLength?: number;
  /** Header name for correlation ID */
  correlationIdHeader?: string;
  /** Generate correlation ID if not present */
  generateCorrelationId?: boolean;
}

// Extend Express Request type - uses string to be compatible with services that
// may declare correlationId as required (string) instead of optional (string | undefined)
declare global {
  namespace Express {
    interface Request {
      correlationId: string;
      requestId: string;
      startTime: number;
      log: Logger;
    }
  }
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_SKIP_PATHS = ['/health', '/healthz', '/ready', '/metrics', '/favicon.ico'];
const DEFAULT_CORRELATION_ID_HEADER = 'x-correlation-id';
const DEFAULT_REQUEST_ID_HEADER = 'x-request-id';

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Create request logger middleware.
 */
export function requestLogger(options: RequestLoggerOptions = {}): RequestHandler {
  const {
    service = process.env.SERVICE_NAME || 'supermandi',
    skipPaths = DEFAULT_SKIP_PATHS,
    logBody = false,
    logResponseBody = false,
    maxBodyLength = 1000,
    correlationIdHeader = DEFAULT_CORRELATION_ID_HEADER,
    generateCorrelationId = true,
  } = options;

  const logger = options.logger || createLogger({ service });

  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip logging for certain paths
    if (skipPaths.some((path) => req.path.startsWith(path))) {
      return next();
    }

    // Extract or generate correlation ID
    const correlationId =
      (req.headers[correlationIdHeader] as string) ||
      (req.headers[correlationIdHeader.toLowerCase()] as string) ||
      (generateCorrelationId ? uuidv4() : uuidv4()); // Always generate if not present

    // Generate request ID
    const requestId = uuidv4();

    // Store on request object
    req.correlationId = correlationId;
    req.requestId = requestId;
    req.startTime = Date.now();

    // Create child logger with context
    req.log = logger.child({
      correlationId,
      requestId,
      method: req.method,
      path: req.path,
    });

    // Set response headers
    if (correlationId) {
      res.setHeader(correlationIdHeader, correlationId);
    }
    res.setHeader(DEFAULT_REQUEST_ID_HEADER, requestId);

    // Log request
    const requestLog: Record<string, unknown> = {
      method: req.method,
      url: req.originalUrl || req.url,
      path: req.path,
      query: Object.keys(req.query).length > 0 ? req.query : undefined,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      contentLength: req.headers['content-length'],
      contentType: req.headers['content-type'],
    };

    // Optionally log body
    if (logBody && req.body && Object.keys(req.body).length > 0) {
      requestLog.body = truncateBody(req.body, maxBodyLength);
    }

    req.log.info('Request received', { request: requestLog });

    // Capture response
    const originalSend = res.send;
    let responseBody: unknown;

    res.send = function (body): Response {
      responseBody = body;
      return originalSend.call(this, body);
    };

    // Log response on finish
    res.on('finish', () => {
      const durationMs = Date.now() - (req.startTime || Date.now());

      const responseLog: Record<string, unknown> = {
        method: req.method,
        url: req.originalUrl || req.url,
        statusCode: res.statusCode,
        statusMessage: res.statusMessage,
        durationMs,
        contentLength: res.getHeader('content-length'),
      };

      // Optionally log response body
      if (logResponseBody && responseBody) {
        responseLog.body = truncateBody(responseBody, maxBodyLength);
      }

      // Log at appropriate level based on status code
      if (res.statusCode >= 500) {
        req.log?.error('Request completed with server error', { response: responseLog });
      } else if (res.statusCode >= 400) {
        req.log?.warn('Request completed with client error', { response: responseLog });
      } else {
        req.log?.info('Request completed', { response: responseLog });
      }
    });

    // Handle errors
    res.on('error', (error) => {
      req.log?.error('Response error', error);
    });

    next();
  };
}

/**
 * Middleware to extract correlation ID from headers.
 */
export function correlationId(
  headerName: string = DEFAULT_CORRELATION_ID_HEADER
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const id =
      (req.headers[headerName] as string) ||
      (req.headers[headerName.toLowerCase()] as string) ||
      uuidv4();

    req.correlationId = id;
    res.setHeader(headerName, id);

    next();
  };
}

/**
 * Get correlation ID from request or generate new one.
 */
export function getCorrelationId(req: Request): string {
  return req.correlationId || uuidv4();
}

/**
 * Get request ID from request or generate new one.
 */
export function getRequestId(req: Request): string {
  return req.requestId || uuidv4();
}

// =============================================================================
// HELPERS
// =============================================================================

function truncateBody(body: unknown, maxLength: number): unknown {
  if (typeof body === 'string') {
    if (body.length > maxLength) {
      return body.substring(0, maxLength) + '...[truncated]';
    }
    return body;
  }

  if (typeof body === 'object' && body !== null) {
    try {
      const str = JSON.stringify(body);
      if (str.length > maxLength) {
        return str.substring(0, maxLength) + '...[truncated]';
      }
    } catch {
      return '[unserializable]';
    }
  }

  return body;
}

export default requestLogger;
