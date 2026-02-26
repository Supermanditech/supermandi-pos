// AUTH-CSRF-001: CSRF Protection Middleware
// Requires a custom header on state-changing requests to prevent CSRF attacks.
// Cross-origin form submissions cannot set custom headers, making this effective.
// Works in conjunction with CORS (only allowed origins can make XHR requests).

import { Request, Response, NextFunction } from 'express';
import { createLogger } from '@supermandi/common';

const logger = createLogger({ service: 'api-gateway', level: process.env.LOG_LEVEL || 'info' });

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Paths exempt from CSRF check (public auth endpoints that don't need it)
// LIVE.GW.CSRF_WEBHOOK_EXEMPTIONS.001: Exempt webhooks (server-to-server, can't send custom headers)
const EXEMPT_PREFIXES = [
  '/api/v1/health',
  '/api/v1/ready',
  '/api/v1/webhooks',
  '/health',
  '/ready',
];

/**
 * AUTH-CSRF-001: CSRF protection middleware.
 * Requires `X-Requested-With: XMLHttpRequest` header on all state-changing requests.
 * This header cannot be set by cross-origin form submissions, preventing CSRF.
 */
export function csrfProtectionMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Only check state-changing methods
  if (!STATE_CHANGING_METHODS.has(req.method)) {
    next();
    return;
  }

  // Skip exempt paths
  const path = req.path.toLowerCase();
  if (EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    next();
    return;
  }

  // Check for custom header (can't be set by cross-origin forms)
  const requestedWith = req.headers['x-requested-with'];
  const contentType = req.headers['content-type'];

  // Accept if either:
  // 1. X-Requested-With header is present (any value)
  // 2. Content-Type is application/json (can't be sent by HTML forms)
  if (requestedWith || (contentType && contentType.includes('application/json'))) {
    next();
    return;
  }

  // Reject — likely a CSRF attempt or misconfigured client
  logger.warn(`[AUTH-CSRF-001] Blocked request without CSRF header: ${req.method} ${req.path}`);
  res.status(403).json({
    error: {
      code: 'CSRF_VALIDATION_FAILED',
      message: 'Request blocked. Include Content-Type: application/json or X-Requested-With header.',
    },
  });
}
