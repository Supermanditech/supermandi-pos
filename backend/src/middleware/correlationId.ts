// T-210: Correlation ID middleware for structured logging
// Extracts or generates a correlation ID and attaches it to req + response headers.
// Usage: app.use(correlationIdMiddleware);

import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      correlationId: string;
    }
  }
}

/**
 * Middleware: attach correlationId from X-Request-Id, X-Cloud-Trace-Context, or generate UUID.
 * Sets X-Request-Id on the response for traceability.
 */
export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const correlationId =
    (req.headers["x-request-id"] as string) ||
    extractTraceId(req.headers["x-cloud-trace-context"] as string) ||
    randomUUID();

  req.correlationId = correlationId;
  res.setHeader("X-Request-Id", correlationId);
  next();
}

/**
 * Extract trace ID from Cloud Trace context header (format: TRACE_ID/SPAN_ID;o=TRACE_TRUE)
 */
function extractTraceId(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const slashIndex = header.indexOf("/");
  return slashIndex > 0 ? header.slice(0, slashIndex) : header;
}
