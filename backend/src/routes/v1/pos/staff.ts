// SA-P1-001: POS staff PIN login endpoint
// STG-487: Staff /me endpoint (role, display name, max discount)
// STG-488: Manager PIN verification endpoint
import { Router } from "express";
import bcrypt from "bcryptjs";
import { getPool } from "../../../db/client";
import { requireDeviceToken } from "../../../middleware/deviceToken";
import type { PosDeviceContext } from "../../../middleware/deviceToken";
import { requirePosStaff } from "../../../middleware/posStaff";
import type { PosStaffContext } from "../../../middleware/posStaff";
import { log } from "../../../lib/logger";

export const posStaffRouter = Router();

// STG-488: Rate limit tracker for PIN verification (in-memory, per-process)
const pinFailures = new Map<string, { count: number; resetAt: number }>();
// V3-BE-013: Import canonical auth helpers (shared with tests — single source of truth)
import {
  PIN_RATE_LIMIT_MAX,
  PIN_RATE_LIMIT_WINDOW_MS,
  pinLookupHash,
  isValidPinFormat,
  isAccountLocked,
  computeLockout,
} from "../../../services/staffAuthHelpers";

posStaffRouter.post("/staff/login", requireDeviceToken, async (req, res) => {
  try {
    const { pin } = req.body ?? {};
    const posDevice = (req as any).posDevice as PosDeviceContext;

    if (!pin || typeof pin !== "string") {
      return res.status(400).json({
        error: { code: "INVALID_INPUT", message: "PIN is required" }
      });
    }

    if (!isValidPinFormat(pin)) {
      return res.status(400).json({
        error: { code: "INVALID_PIN_FORMAT", message: "PIN must be 4-6 digits" }
      });
    }

    const pool = getPool();
    if (!pool) {
      return res.status(503).json({ error: { code: "SERVICE_UNAVAILABLE", message: "Database unavailable" } });
    }

    // V3-BIZ-026: PIN-only lookup using store-scoped pin_lookup_hash
    const lookupHash = pinLookupHash(pin, posDevice.storeId);
    const result = await pool.query(
      `SELECT id, name, pin_hash, role, is_owner, locked_until, failed_login_count
       FROM platform.store_staff
       WHERE store_id = $1::uuid AND pin_lookup_hash = $2 AND is_active = true`,
      [posDevice.storeId, lookupHash]
    );

    const staff = result.rows[0];
    if (!staff) {
      // Fallback: try legacy phone+pin lookup for backward compatibility
      const { phone } = req.body ?? {};
      if (phone && typeof phone === "string") {
        const legacyResult = await pool.query(
          `SELECT id, name, pin_hash, role
           FROM platform.store_staff
           WHERE store_id = $1::uuid AND phone = $2 AND is_active = true`,
          [posDevice.storeId, phone.trim()]
        );
        const legacyStaff = legacyResult.rows[0];
        if (legacyStaff) {
          const pinValid = await bcrypt.compare(pin, legacyStaff.pin_hash);
          if (pinValid) {
            // Update last_login_at
            await pool.query(`UPDATE platform.store_staff SET last_login_at = NOW() WHERE id = $1`, [legacyStaff.id]);
            return res.json({ staffId: legacyStaff.id, name: legacyStaff.name, role: legacyStaff.role, isOwner: false, maxDiscountPct: legacyStaff.role === "MANAGER" ? 100 : 10 });
          }
        }
      }
      return res.status(401).json({
        error: { code: "STAFF_INVALID_CREDENTIALS", message: "Invalid PIN" }
      });
    }

    // V3-SESSION-025: Durable lockout check (via canonical helper)
    if (isAccountLocked(staff.locked_until)) {
      const remainingMin = Math.ceil((new Date(staff.locked_until).getTime() - Date.now()) / 60000);
      return res.status(429).json({
        error: { code: "STAFF_LOCKED", message: `Account locked. Try again in ${remainingMin} minutes.` }
      });
    }

    // Verify PIN with bcrypt
    const pinValid = await bcrypt.compare(pin, staff.pin_hash);
    if (!pinValid) {
      // Durable failed login tracking (via canonical helper)
      const newCount = (staff.failed_login_count ?? 0) + 1;
      const lockResult = computeLockout(newCount);
      const lockUntil = lockResult.locked ? lockResult.lockUntil : null;
      await pool.query(
        `UPDATE platform.store_staff SET failed_login_count = $1, last_failed_login_at = NOW(), locked_until = $2 WHERE id = $3`,
        [newCount, lockUntil, staff.id]
      );
      return res.status(401).json({
        error: { code: "STAFF_INVALID_CREDENTIALS", message: "Invalid PIN" }
      });
    }

    // Success — reset lockout and update login timestamp
    await pool.query(
      `UPDATE platform.store_staff SET failed_login_count = 0, locked_until = NULL, last_login_at = NOW() WHERE id = $1`,
      [staff.id]
    );

    return res.json({
      staffId: staff.id,
      name: staff.name,
      role: staff.role,
      isOwner: staff.is_owner ?? false,
      maxDiscountPct: staff.role === "MANAGER" ? 100 : staff.role === "STOCK_MANAGER" ? 50 : 10,
    });
  } catch (err) {
    log.error("[POS Staff Login] Error:", err);
    return res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Staff login failed" }
    });
  }
});

// STG-487: GET /api/v1/pos/staff/me
// Returns current staff info + store's max discount percent
posStaffRouter.get(
  "/staff/me",
  requireDeviceToken,
  requirePosStaff,
  async (req, res) => {
    try {
      const posDevice = (req as any).posDevice as PosDeviceContext;
      const posStaff = (req as any).posStaff as PosStaffContext;

      const pool = getPool();
      if (!pool) {
        return res.status(503).json({
          error: { code: "SERVICE_UNAVAILABLE", message: "Database unavailable" }
        });
      }

      // Fetch store's max discount percent
      const storeResult = await pool.query(
        `SELECT max_discount_percent FROM platform.stores WHERE id = $1::uuid`,
        [posDevice.storeId]
      );

      const maxDiscountPct = storeResult.rows[0]?.max_discount_percent ?? 100;

      return res.json({
        staffId: posStaff.staffId,
        name: posStaff.name,
        role: posStaff.role,
        maxDiscountPct: Number(maxDiscountPct),
      });
    } catch (err) {
      log.error("[POS Staff Me] Error:", err);
      return res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Failed to fetch staff info" }
      });
    }
  }
);

// STG-488: POST /api/v1/pos/staff/verify-pin
// Verifies a manager's PIN for discount approval override
// Rate limited: max 5 failed attempts per 15 minutes per store+phone
posStaffRouter.post(
  "/staff/verify-pin",
  requireDeviceToken,
  async (req, res) => {
    try {
      const { phone, pin } = req.body ?? {};
      const posDevice = (req as any).posDevice as PosDeviceContext;

      if (!phone || typeof phone !== "string" || !pin || typeof pin !== "string") {
        return res.status(400).json({
          error: { code: "INVALID_INPUT", message: "phone and pin are required" }
        });
      }

      if (!isValidPinFormat(pin)) {
        return res.status(400).json({
          error: { code: "INVALID_PIN_FORMAT", message: "PIN must be 4-6 digits" }
        });
      }

      if (!posDevice.storeId) {
        return res.status(403).json({
          error: { code: "DEVICE_NOT_ENROLLED", message: "Device not enrolled to a store" }
        });
      }

      // Rate limit check
      const rateLimitKey = `${posDevice.storeId}:${phone.trim()}`;
      const now = Date.now();
      const entry = pinFailures.get(rateLimitKey);
      if (entry) {
        if (now < entry.resetAt && entry.count >= PIN_RATE_LIMIT_MAX) {
          const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
          return res.status(429).json({
            error: {
              code: "RATE_LIMITED",
              message: `Too many failed attempts. Try again in ${retryAfterSec}s`,
              retryAfterSec,
            }
          });
        }
        if (now >= entry.resetAt) {
          pinFailures.delete(rateLimitKey);
        }
      }

      const pool = getPool();
      if (!pool) {
        return res.status(503).json({
          error: { code: "SERVICE_UNAVAILABLE", message: "Database unavailable" }
        });
      }

      // Lookup manager/stock_manager staff by store + phone + active
      const result = await pool.query(
        `SELECT id, name, phone, pin_hash, role
         FROM platform.store_staff
         WHERE store_id = $1::uuid AND phone = $2 AND is_active = true
           AND role IN ('MANAGER', 'STOCK_MANAGER')`,
        [posDevice.storeId, phone.trim()]
      );

      const staff = result.rows[0];
      if (!staff) {
        // Don't reveal whether phone exists — generic message
        recordPinFailure(rateLimitKey, now);
        log.warn(`[POS Verify PIN] Staff not found: store=${posDevice.storeId} phone=${phone.trim()}`);
        return res.status(401).json({
          error: { code: "PIN_INVALID", message: "Invalid credentials" }
        });
      }

      const pinValid = await bcrypt.compare(pin, staff.pin_hash);
      if (!pinValid) {
        recordPinFailure(rateLimitKey, now);
        log.warn(`[POS Verify PIN] Wrong PIN: store=${posDevice.storeId} staffId=${staff.id}`);
        return res.status(401).json({
          error: { code: "PIN_INVALID", message: "Invalid credentials" }
        });
      }

      // Success — clear rate limit
      pinFailures.delete(rateLimitKey);

      log.info(`[POS Verify PIN] Success: store=${posDevice.storeId} staffId=${staff.id} role=${staff.role}`);
      return res.json({
        verified: true,
        staffId: staff.id,
        name: staff.name,
        role: staff.role,
      });
    } catch (err) {
      log.error("[POS Verify PIN] Error:", err);
      return res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "PIN verification failed" }
      });
    }
  }
);

function recordPinFailure(key: string, now: number): void {
  const entry = pinFailures.get(key);
  if (entry && now < entry.resetAt) {
    entry.count++;
  } else {
    pinFailures.set(key, { count: 1, resetAt: now + PIN_RATE_LIMIT_WINDOW_MS });
  }
}
