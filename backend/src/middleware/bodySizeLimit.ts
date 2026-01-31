/**
 * GO-LIVE-194: Per-endpoint request body size limits
 *
 * This middleware enforces different body size limits for different endpoints
 * to prevent DoS attacks via large payloads while allowing legitimate large
 * uploads (e.g., audio files for voice orders).
 *
 * Default is restrictive (100KB); endpoints that need more must be explicitly listed.
 */

import type { NextFunction, Request, Response } from "express";
import express from "express";

// Endpoint-specific size limits (in bytes)
// Keys are route patterns (regex-matched against req.path)
const ENDPOINT_SIZE_LIMITS: { pattern: RegExp; limit: string }[] = [
  // Voice/Audio endpoints need larger limits for audio files (up to 5MB)
  { pattern: /\/voice\/process/, limit: "5mb" },
  { pattern: /\/voice\/transcribe/, limit: "5mb" },
  { pattern: /\/ai\/voice/, limit: "5mb" },

  // Image upload endpoints (up to 2MB)
  { pattern: /\/upload\/image/, limit: "2mb" },
  { pattern: /\/products\/.*\/image/, limit: "2mb" },

  // Batch/sync endpoints need moderate limits (500KB)
  { pattern: /\/batch/, limit: "500kb" },
  { pattern: /\/sync/, limit: "500kb" },
  { pattern: /\/stock-in\/batch/, limit: "500kb" },

  // Sales can have multiple items but still limited (200KB)
  { pattern: /\/sales$/, limit: "200kb" },
  { pattern: /\/sales\//, limit: "200kb" },

  // Simple endpoints get smaller limits (50KB)
  { pattern: /\/enroll$/, limit: "50kb" },
  { pattern: /\/auth\//, limit: "50kb" },
  { pattern: /\/token\//, limit: "50kb" },
  { pattern: /\/stores\/[^/]+$/, limit: "100kb" },
];

// Default limit for endpoints not explicitly listed
const DEFAULT_LIMIT = "100kb";

/**
 * Get the body size limit for a given path
 */
function getLimitForPath(path: string): string {
  for (const { pattern, limit } of ENDPOINT_SIZE_LIMITS) {
    if (pattern.test(path)) {
      return limit;
    }
  }
  return DEFAULT_LIMIT;
}

/**
 * Parse size string to bytes (e.g., "100kb" -> 102400)
 */
function parseSize(size: string): number {
  const match = size.match(/^(\d+)(b|kb|mb|gb)?$/i);
  if (!match) return 100 * 1024; // Default 100KB

  const num = parseInt(match[1], 10);
  const unit = (match[2] || "b").toLowerCase();

  switch (unit) {
    case "gb":
      return num * 1024 * 1024 * 1024;
    case "mb":
      return num * 1024 * 1024;
    case "kb":
      return num * 1024;
    default:
      return num;
  }
}

/**
 * GO-LIVE-194: Per-endpoint body size limit middleware
 *
 * This middleware checks Content-Length header before parsing the body
 * and rejects requests that exceed the limit for that endpoint.
 */
export function perEndpointBodyLimit() {
  return (req: Request, res: Response, next: NextFunction) => {
    const limit = getLimitForPath(req.path);
    const limitBytes = parseSize(limit);

    // Check Content-Length header first (before body parsing)
    const contentLength = req.headers["content-length"];
    if (contentLength) {
      const bodySize = parseInt(contentLength, 10);
      if (bodySize > limitBytes) {
        // BATCH5-SUGGESTION-1: Structured logging for observability
        console.log(JSON.stringify({
          event: "body_too_large",
          route: req.path,
          method: req.method,
          content_length: bodySize,
          max_bytes: limitBytes,
          limit,
          ip: req.ip || "unknown",
        }));
        return res.status(413).json({
          error: {
            code: "BODY_TOO_LARGE",
            message: `Request body exceeds the ${limit} limit for this endpoint.`,
            limit,
            received: `${Math.ceil(bodySize / 1024)}kb`,
          },
        });
      }
    }

    // Apply express.json with the appropriate limit
    // This is a backup check in case Content-Length is missing
    express.json({ limit })(req, res, (err) => {
      if (err) {
        if (err.type === "entity.too.large") {
          // BATCH5-SUGGESTION-1: Structured logging for backup check
          console.log(JSON.stringify({
            event: "body_too_large",
            route: req.path,
            method: req.method,
            max_bytes: limitBytes,
            limit,
            ip: req.ip || "unknown",
            note: "Content-Length header was missing or incorrect",
          }));
          return res.status(413).json({
            error: {
              code: "BODY_TOO_LARGE",
              message: `Request body exceeds the ${limit} limit for this endpoint.`,
              limit,
            },
          });
        }
        return next(err);
      }
      next();
    });
  };
}

/**
 * Get configured limits for monitoring/debugging
 */
export function getBodySizeLimits(): { pattern: string; limit: string }[] {
  return [
    ...ENDPOINT_SIZE_LIMITS.map(({ pattern, limit }) => ({
      pattern: pattern.source,
      limit,
    })),
    { pattern: "(default)", limit: DEFAULT_LIMIT },
  ];
}

export default perEndpointBodyLimit;
