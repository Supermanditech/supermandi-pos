// PORTAL-AUTH-001: Unified Auth Routes
// Shared authentication endpoints for both retailer and supplier portals
// POST /api/v1/auth/phone/exists - Check if phone is registered

import { Router, Request, Response, NextFunction } from "express";
import { getPool } from "../../db/client";
import { redisRateLimit } from "../../middleware/rateLimit";

const router = Router();

// SA-P2-011: Redis-backed rate limiter for auth check endpoints
const authCheckRateLimiter = redisRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per window
  keyGenerator: (req) => {
    return req.ip || 'unknown';
  },
});

// =============================================================================
// UTILITIES
// =============================================================================

function normalizePhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  if (digits.length > 10) {
    return `+${digits}`;
  }
  return `+${digits}`;
}

// =============================================================================
// ROUTES
// =============================================================================

/**
 * POST /api/v1/auth/phone/exists
 * PORTAL-AUTH-001: Check if a phone number is registered
 *
 * Request body:
 * - phone: Phone number to check (required)
 * - portal: "retailer" | "supplier" (required)
 *
 * Response:
 * - exists: true/false
 * - portal: "retailer" | "supplier"
 *
 * Note: Returns 200 always with exists boolean (never leaks extra info)
 */
router.post("/phone/exists", authCheckRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone, portal } = req.body as { phone?: string; portal?: string };

    // Validate inputs
    if (!phone) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Phone number is required" }
      });
      return;
    }

    if (!portal || !["retailer", "supplier"].includes(portal)) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Portal must be 'retailer' or 'supplier'" }
      });
      return;
    }

    const phoneNormalized = normalizePhoneNumber(phone);

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database unavailable" } });
      return;
    }

    let exists = false;

    if (portal === "retailer") {
      // Check for active store user (can login directly)
      const storeUserResult = await pool.query(
        `SELECT 1 FROM auth.store_users su
         JOIN auth.users u ON u.id = su.user_id
         JOIN platform.stores s ON s.id = su.store_id
         WHERE u.phone = $1 AND su.is_active = true
         LIMIT 1`,
        [phoneNormalized]
      );

      if (storeUserResult.rows.length > 0) {
        exists = true;
      } else {
        // Check for application with ACTIVE status
        const appResult = await pool.query(
          `SELECT 1 FROM auth.applications
           WHERE phone = $1 AND entity_type = 'retailer' AND status = 'ACTIVE'
           LIMIT 1`,
          [phoneNormalized]
        );
        exists = appResult.rows.length > 0;
      }
    } else {
      // portal === "supplier"
      // Check for active supplier user
      const supplierUserResult = await pool.query(
        `SELECT 1 FROM supplier.suppliers
         WHERE primary_phone = $1 AND verification_status = 'verified'
         LIMIT 1`,
        [phoneNormalized]
      );

      if (supplierUserResult.rows.length > 0) {
        exists = true;
      } else {
        // Check for application with ACTIVE status
        const appResult = await pool.query(
          `SELECT 1 FROM auth.applications
           WHERE phone = $1 AND entity_type = 'supplier' AND status = 'ACTIVE'
           LIMIT 1`,
          [phoneNormalized]
        );
        exists = appResult.rows.length > 0;
      }
    }

    // Return 200 always with exists boolean (security: don't leak extra info)
    res.json({
      exists,
      portal,
    });
  } catch (error) {
    next(error);
  }
});

export const authRouter = router;
