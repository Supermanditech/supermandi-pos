/**
 * GCP Cloud Trace integration middleware
 * Extracts trace context from Cloud Run's X-Cloud-Trace-Context header
 * and makes it available for structured logging and performance tracking.
 */
import { Request, Response, NextFunction } from 'express';
import { log } from "../lib/logger";

export interface TraceContext {
  traceId: string;
  spanId: string;
  sampled: boolean;
}

/**
 * Parse GCP trace header: TRACE_ID/SPAN_ID;o=TRACE_TRUE
 */
function parseTraceHeader(header: string | undefined): TraceContext | null {
  if (!header) return null;
  const match = header.match(/^([a-f0-9]{32})\/(\d+);o=(\d)$/);
  if (!match) return null;
  return {
    traceId: match[1],
    spanId: match[2],
    sampled: match[3] === '1',
  };
}

export function tracingMiddleware(req: Request, _res: Response, next: NextFunction) {
  const traceHeader = req.headers['x-cloud-trace-context'] as string | undefined;
  const trace = parseTraceHeader(traceHeader);

  // Attach to request for downstream use
  (req as any).traceContext = trace;

  // Add trace info to response headers for debugging
  if (trace) {
    _res.setHeader('X-Trace-Id', trace.traceId);
  }

  // Track request timing
  const startTime = Date.now();
  _res.on('finish', () => {
    const duration = Date.now() - startTime;
    // GCP Cloud Logging will auto-correlate if we log with trace fields
    if (trace && duration > 1000) {
      log.warn(`Slow request: ${req.method} ${req.path} took ${duration}ms [trace=${trace.traceId}]`);
    }
  });

  next();
}
