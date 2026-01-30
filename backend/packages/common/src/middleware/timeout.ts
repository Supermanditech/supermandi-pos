// Request Timeout Middleware - GO-LIVE-056
// Handles request timeout to prevent hanging connections

import { Request, Response, NextFunction, RequestHandler } from 'express';

// =============================================================================
// TYPES
// =============================================================================

export interface TimeoutOptions {
  /** Timeout in milliseconds (default: 30000 = 30 seconds) */
  timeoutMs?: number;
  /** Custom error message */
  message?: string;
  /** Paths to skip timeout handling */
  skipPaths?: string[];
  /** Error code to return */
  errorCode?: string;
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * GO-LIVE-056: Request timeout middleware
 * Terminates requests that exceed the specified timeout.
 */
export function requestTimeout(options: TimeoutOptions = {}): RequestHandler {
  const {
    timeoutMs = parseInt(process.env.REQUEST_TIMEOUT_MS || '30000', 10),
    message = 'Request timeout',
    skipPaths = ['/health', '/healthz', '/ready', '/metrics'],
    errorCode = 'REQUEST_TIMEOUT',
  } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip timeout for certain paths
    if (skipPaths.some((path) => req.path.startsWith(path))) {
      return next();
    }

    let timedOut = false;

    // Set timeout
    const timeout = setTimeout(() => {
      timedOut = true;

      // Don't try to send response if headers already sent
      if (res.headersSent) {
        return;
      }

      res.status(408).json({
        error: {
          code: errorCode,
          message,
        },
        requestId: req.correlationId || req.requestId,
      });
    }, timeoutMs);

    // Clear timeout on response finish
    res.on('finish', () => {
      clearTimeout(timeout);
    });

    // Clear timeout on response close
    res.on('close', () => {
      clearTimeout(timeout);
    });

    // Wrap next to prevent processing after timeout
    const wrappedNext = (err?: unknown): void => {
      if (timedOut) {
        return;
      }
      next(err);
    };

    wrappedNext();
  };
}

export default requestTimeout;
