// Request Logger Middleware - V3.0.9 compliant
// GCP-STG-0628: Structured access logging with duration, status, and user-agent
// Logs all incoming requests with correlation ID and timing

import { Request, Response, NextFunction } from 'express';
import { createLogger } from '@supermandi/common';

const logger = createLogger({ service: 'api-gateway', level: process.env.LOG_LEVEL || 'info' });

// GCP-STG-0628: Paths to exclude from access logging (high-frequency health checks)
const SKIP_LOG_PATHS = new Set(['/health', '/healthz', '/ready', '/readyz']);

/**
 * Middleware to log requests
 * GCP-STG-0628: Uses res.on('finish') for reliable completion logging
 * - Skips health check endpoints to reduce log noise
 * - Logs structured JSON with method, path, status, duration_ms, ip, user_agent
 */
export function requestLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // GCP-STG-0628: Skip health check logging
  if (SKIP_LOG_PATHS.has(req.path)) {
    next();
    return;
  }

  const start = Date.now();

  // GCP-STG-0628: Log on response finish (catches all responses including streams)
  res.on('finish', () => {
    const duration_ms = Date.now() - start;
    logger.info({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms,
      ip: req.ip || req.socket?.remoteAddress || 'unknown',
      user_agent: req.get('user-agent')?.substring(0, 100),
      correlation_id: req.correlationId || 'unknown',
    }, 'api_request');
  });

  next();
}

export default requestLoggerMiddleware;
