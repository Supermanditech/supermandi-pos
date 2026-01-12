// Rate Limiter Middleware - V3.0.9 compliant
// Protects API from abuse with configurable rate limits

import rateLimit from 'express-rate-limit';
import { config } from '../config';

/**
 * Create rate limiter middleware
 * - Limits requests per IP per time window
 * - Returns 429 Too Many Requests when exceeded
 */
export const rateLimiterMiddleware = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false, // Disable X-RateLimit-* headers

  // Custom response
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later',
    },
  },

  // Skip rate limiting for health checks
  skip: (req) => {
    return req.path === '/healthz' || req.path === '/health';
  },

  // Key generator (use IP + correlation ID for more granular limiting)
  keyGenerator: (req) => {
    return req.ip || 'unknown';
  },
});

export default rateLimiterMiddleware;
