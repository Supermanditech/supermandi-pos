// Correlation ID Middleware - V3.0.9 compliant
// Adds a unique correlation ID to every request for distributed tracing

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

// Header name for correlation ID
export const CORRELATION_ID_HEADER = 'x-correlation-id';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      correlationId: string;
    }
  }
}

/**
 * Middleware to add correlation ID to requests
 * - Uses existing header if provided (for tracing across services)
 * - Generates new UUID if not present
 * - Adds to response headers for client tracing
 */
export function correlationIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Get existing correlation ID from header or generate new one
  const correlationId =
    (req.headers[CORRELATION_ID_HEADER] as string) || uuidv4();

  // Attach to request object for use in handlers
  req.correlationId = correlationId;

  // Add to response headers
  res.setHeader(CORRELATION_ID_HEADER, correlationId);

  next();
}

export default correlationIdMiddleware;
