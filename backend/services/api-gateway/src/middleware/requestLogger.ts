// Request Logger Middleware - V3.0.9 compliant
// Logs all incoming requests with correlation ID and timing

import { Request, Response, NextFunction } from 'express';

interface LogEntry {
  timestamp: string;
  correlationId: string;
  method: string;
  path: string;
  query: Record<string, unknown>;
  ip: string;
  userAgent: string;
  statusCode?: number;
  responseTime?: number;
}

/**
 * Format log entry as JSON string
 */
function formatLog(entry: LogEntry): string {
  return JSON.stringify(entry);
}

/**
 * Middleware to log requests
 * - Logs request on entry
 * - Logs response on completion with timing
 */
export function requestLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startTime = Date.now();

  // Request log entry
  const logEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    correlationId: req.correlationId || 'unknown',
    method: req.method,
    path: req.path,
    query: req.query as Record<string, unknown>,
    ip: req.ip || req.socket.remoteAddress || 'unknown',
    userAgent: req.get('user-agent') || 'unknown',
  };

  // Log request
  console.log(`[REQ] ${formatLog(logEntry)}`);

  // Intercept response to log completion
  const originalSend = res.send;
  res.send = function (body): Response {
    const responseTime = Date.now() - startTime;

    // Response log entry
    const responseLog: LogEntry = {
      ...logEntry,
      statusCode: res.statusCode,
      responseTime,
    };

    console.log(`[RES] ${formatLog(responseLog)}`);

    return originalSend.call(this, body);
  };

  next();
}

export default requestLoggerMiddleware;
