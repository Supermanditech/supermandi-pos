// Idempotency Middleware - V3.0.9 compliant
// Prevents duplicate mutations using X-Idempotency-Key header

import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { query, queryOne } from '../db/pool';
import { ERROR_CODES } from '../errors/errorCodes';
import { IdempotencyStatus } from '../types/inventory.types';

// =============================================================================
// TYPES
// =============================================================================

interface IdempotencyRecord {
  key: string;
  userId: string;
  route: string;
  requestHash: string;
  status: IdempotencyStatus;
  responseStatus: number | null;
  responseJson: unknown | null;
  createdAt: Date;
  expiresAt: Date;
}

// =============================================================================
// HASH UTILITY
// =============================================================================

/**
 * Generate SHA256 hash of request body for idempotency check
 */
function hashRequestBody(body: unknown): string {
  const normalized = JSON.stringify(body ?? {});
  return createHash('sha256').update(normalized).digest('hex');
}

// =============================================================================
// DATABASE OPERATIONS
// =============================================================================

/**
 * Find existing idempotency record by key
 */
async function findIdempotencyKey(key: string): Promise<IdempotencyRecord | null> {
  return queryOne<IdempotencyRecord>(
    `SELECT
      key,
      user_id as "userId",
      route,
      request_hash as "requestHash",
      status,
      response_status as "responseStatus",
      response_json as "responseJson",
      created_at as "createdAt",
      expires_at as "expiresAt"
    FROM idempotency_keys
    WHERE key = $1 AND expires_at > NOW()`,
    [key]
  );
}

/**
 * Insert new idempotency record with processing status
 */
async function createIdempotencyKey(
  key: string,
  userId: string,
  route: string,
  requestHash: string
): Promise<boolean> {
  try {
    await query(
      `INSERT INTO idempotency_keys (key, user_id, route, request_hash, status, expires_at)
       VALUES ($1, $2, $3, $4, 'processing', NOW() + INTERVAL '24 hours')`,
      [key, userId, route, requestHash]
    );
    return true;
  } catch (error) {
    // Unique constraint violation - another request beat us
    if ((error as { code?: string }).code === '23505') {
      return false;
    }
    throw error;
  }
}

/**
 * Mark idempotency key as completed with response
 */
async function markIdempotencyCompleted(
  key: string,
  responseStatus: number,
  responseJson: unknown
): Promise<void> {
  await query(
    `UPDATE idempotency_keys
     SET status = 'completed',
         response_status = $2,
         response_json = $3
     WHERE key = $1`,
    [key, responseStatus, JSON.stringify(responseJson)]
  );
}

/**
 * Mark idempotency key as failed
 */
async function markIdempotencyFailed(key: string): Promise<void> {
  await query(
    `UPDATE idempotency_keys
     SET status = 'failed'
     WHERE key = $1`,
    [key]
  );
}

/**
 * Delete failed idempotency key (allows retry)
 */
async function deleteFailedKey(key: string): Promise<void> {
  await query(
    `DELETE FROM idempotency_keys
     WHERE key = $1 AND status = 'failed'`,
    [key]
  );
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Express middleware for idempotency key handling
 *
 * Usage:
 *   router.post('/endpoint', idempotencyMiddleware, handler);
 *
 * Behavior:
 * 1. If no X-Idempotency-Key header, proceed without idempotency
 * 2. If key exists + same hash + completed → return cached response
 * 3. If key exists + different hash → 409 IDEMPOTENCY_CONFLICT
 * 4. If key exists + processing → 409 IDEMPOTENCY_IN_PROGRESS with retryAfter
 * 5. If key exists + failed → delete and retry
 * 6. If new key → create with processing, execute handler
 * 7. On success → mark completed with response
 * 8. On failure → mark failed
 */
export function idempotencyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Get idempotency key from header
  const idempotencyKey = req.headers['x-idempotency-key'];
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    // No idempotency key - proceed without protection
    next();
    return;
  }

  // Get user ID (from auth middleware) - default to 'anonymous' if not set
  const userId = (req as { user?: { id?: string } }).user?.id ?? 'anonymous';
  const route = `${req.method} ${req.baseUrl}${req.path}`;
  const requestHash = hashRequestBody(req.body);

  // Process asynchronously
  processIdempotencyKey(idempotencyKey, userId, route, requestHash, req, res, next);
}

async function processIdempotencyKey(
  key: string,
  userId: string,
  route: string,
  requestHash: string,
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Check for existing record
    const existing = await findIdempotencyKey(key);

    if (existing) {
      // Check if hash matches
      if (existing.requestHash !== requestHash) {
        // Different body with same key
        res.status(409).json({
          error: {
            code: ERROR_CODES.IDEMPOTENCY_CONFLICT,
            message: 'Request body differs from original request with this key.',
          },
        });
        return;
      }

      // Same hash - check status
      if (existing.status === 'processing') {
        // Concurrent request still processing
        res.status(409).json({
          error: {
            code: ERROR_CODES.IDEMPOTENCY_IN_PROGRESS,
            message: 'Request with this idempotency key is still being processed.',
            retryAfter: 1,
          },
        });
        return;
      }

      if (existing.status === 'completed') {
        // Return cached response
        res.status(existing.responseStatus ?? 200).json(existing.responseJson);
        return;
      }

      if (existing.status === 'failed') {
        // Delete failed record and retry
        await deleteFailedKey(key);
      }
    }

    // Try to create new record
    const created = await createIdempotencyKey(key, userId, route, requestHash);
    if (!created) {
      // Another request beat us - check again
      const rechecked = await findIdempotencyKey(key);
      if (rechecked?.status === 'processing') {
        res.status(409).json({
          error: {
            code: ERROR_CODES.IDEMPOTENCY_IN_PROGRESS,
            message: 'Request with this idempotency key is still being processed.',
            retryAfter: 1,
          },
        });
        return;
      }
      if (rechecked?.status === 'completed') {
        res.status(rechecked.responseStatus ?? 200).json(rechecked.responseJson);
        return;
      }
    }

    // Wrap res.json to capture response
    const originalJson = res.json.bind(res);
    let responseCaptured = false;

    res.json = function (body: unknown) {
      if (!responseCaptured) {
        responseCaptured = true;
        // Capture response asynchronously
        markIdempotencyCompleted(key, res.statusCode, body).catch((err) => {
          console.error('[Idempotency] Failed to mark completed:', err);
        });
      }
      return originalJson(body);
    };

    // Handle errors
    res.on('finish', () => {
      if (!responseCaptured && res.statusCode >= 400) {
        markIdempotencyFailed(key).catch((err) => {
          console.error('[Idempotency] Failed to mark failed:', err);
        });
      }
    });

    // Proceed to handler
    next();
  } catch (error) {
    console.error('[Idempotency] Middleware error:', error);
    // On middleware error, proceed without idempotency protection
    // rather than blocking the request
    next();
  }
}

// =============================================================================
// FACTORY FOR ROUTE-SPECIFIC MIDDLEWARE
// =============================================================================

/**
 * Create idempotency middleware with custom options
 */
export interface IdempotencyOptions {
  /** Custom function to extract user ID from request */
  getUserId?: (req: Request) => string;
  /** TTL for idempotency keys in seconds (default: 86400 = 24 hours) */
  ttlSeconds?: number;
  /** Whether to require the header (default: false - optional) */
  required?: boolean;
}

export function createIdempotencyMiddleware(options: IdempotencyOptions = {}) {
  return function (req: Request, res: Response, next: NextFunction): void {
    const idempotencyKey = req.headers['x-idempotency-key'];

    // Check if required
    if (options.required && (!idempotencyKey || typeof idempotencyKey !== 'string')) {
      res.status(400).json({
        error: {
          code: 'MISSING_IDEMPOTENCY_KEY',
          message: 'X-Idempotency-Key header is required for this endpoint.',
        },
      });
      return;
    }

    // Delegate to standard middleware
    idempotencyMiddleware(req, res, next);
  };
}
