// Rate Limiter Middleware - V3.0.10 compliant
// Protects API from abuse with configurable rate limits
// GL-CRIT-0027: Reduced default from 100 to 30/min, auth endpoints 5/min

import rateLimit from 'express-rate-limit';
import { config } from '../config';

/**
 * General rate limiter middleware
 * - Limits requests per IP per time window
 * - Returns 429 Too Many Requests when exceeded
 * - GL-CRIT-0027: Reduced to 30/min for public APIs
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

  // Skip rate limiting for health checks and admin routes
  // RET-AUD-019: Admin routes are authenticated and have separate adminRateLimiter
  skip: (req) => {
    return req.path === '/healthz' ||
           req.path === '/health' ||
           req.path.startsWith('/api/v1/admin');
  },

  // Key generator (use IP + correlation ID for more granular limiting)
  keyGenerator: (req) => {
    return req.ip || 'unknown';
  },
});

/**
 * Strict rate limiter for auth endpoints
 * GL-CRIT-0027: 5 requests per minute for login/auth to prevent brute force
 */
export const authRateLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,

  message: {
    error: {
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts, please try again later',
    },
  },

  keyGenerator: (req) => {
    return req.ip || 'unknown';
  },
});

/**
 * GO-LIVE-003: Strict rate limiter for admin token attempts
 * 5 requests per minute per IP to prevent brute force attacks on admin token
 */
export const adminRateLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs, // 1 minute
  max: config.authRateLimitMax, // 5 attempts per minute (same as auth)
  standardHeaders: true,
  legacyHeaders: false,

  message: {
    error: {
      code: 'ADMIN_RATE_LIMIT_EXCEEDED',
      message: 'Too many admin authentication attempts, please try again later',
    },
  },

  keyGenerator: (req) => {
    return req.ip || 'unknown';
  },

  // Only count failed admin token attempts
  skipSuccessfulRequests: true,
});

export default rateLimiterMiddleware;
