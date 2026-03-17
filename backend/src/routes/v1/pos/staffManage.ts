/**
 * V3-POS-024: Owner staff management from POS
 * Endpoints for owner to list/create/update/reset staff from POS Settings.
 * Uses device token for store scope + staff session for owner authorization.
 */

import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { getPool } from "../../../db/client";
import { requireDeviceToken } from "../../../middleware/deviceToken";
import type { PosDeviceContext } from "../../../middleware/deviceToken";
import { requirePosStaff } from "../../../middleware/posStaff";
import { log } from "../../../lib/logger";

export const posStaffManageRouter = Router();

const VALID_ROLES = ["CASHIER", "STOCK_MANAGER", "MANAGER"] as const;
const PIN_PATTERN = /^\d{4,6}$/;

function pinLookupHash(pin: string, storeId: string): string {
  return crypto.createHash("sha256").update(`${storeId}:${pin}`).digest("hex");
}

// GET /api/v1/pos/staff/list — list all staff for the current store
posStaffManageRouter.get("/staff/list", requireDeviceToken, async (req, res) => {
  try {
    const posDevice = (req as any).posDevice as PosDeviceContext;
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: { code: "SERVICE_UNAVAILABLE", message: "Database unavailable" } });

    const result = await pool.query(
      `SELECT id, name, role, is_active, is_owner, last_login_at, created_at
       FROM platform.store_staff
       WHERE store_id = $1::uuid
       ORDER BY is_owner DESC, created_at ASC`,
      [posDevice.storeId]
    );

    res.json({ staff: result.rows });
  } catch (err) {
    log.error("[POS Staff Manage] list error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to list staff" } });
  }
});

// POST /api/v1/pos/staff/create — create a new staff member (owner only)
posStaffManageRouter.post("/staff/create", requireDeviceToken, requirePosStaff, async (req, res) => {
  try {
    const posDevice = (req as any).posDevice as PosDeviceContext;
    const { name, pin, role } = req.body ?? {};

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return res.status(400).json({ error: { code: "INVALID_NAME", message: "Staff name must be at least 2 characters" } });
    }
    if (!pin || !PIN_PATTERN.test(pin)) {
      return res.status(400).json({ error: { code: "INVALID_PIN", message: "PIN must be 4-6 digits" } });
    }
    if (!role || !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: { code: "INVALID_ROLE", message: `Role must be one of: ${VALID_ROLES.join(", ")}` } });
    }

    const pool = getPool();
    if (!pool) return res.status(503).json({ error: { code: "SERVICE_UNAVAILABLE", message: "Database unavailable" } });

    // V3-BIZ-026: Check PIN uniqueness within store
    const lookupHash = pinLookupHash(pin, posDevice.storeId);
    const dupCheck = await pool.query(
      `SELECT id FROM platform.store_staff WHERE store_id = $1::uuid AND pin_lookup_hash = $2 AND is_active = true`,
      [posDevice.storeId, lookupHash]
    );
    if (dupCheck.rows.length > 0) {
      return res.status(409).json({ error: { code: "PIN_ALREADY_USED", message: "This PIN is already used by another staff member in this store" } });
    }

    const pinHash = await bcrypt.hash(pin, 10);

    const result = await pool.query(
      `INSERT INTO platform.store_staff (store_id, name, pin_hash, pin_lookup_hash, role, is_active, is_owner)
       VALUES ($1::uuid, $2, $3, $4, $5, true, false)
       RETURNING id, name, role, is_active, created_at`,
      [posDevice.storeId, name.trim(), pinHash, lookupHash, role]
    );

    res.status(201).json({ staff: result.rows[0] });
  } catch (err) {
    log.error("[POS Staff Manage] create error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to create staff" } });
  }
});

// POST /api/v1/pos/staff/:staffId/reset-pin — reset a staff member's PIN
posStaffManageRouter.post("/staff/:staffId/reset-pin", requireDeviceToken, requirePosStaff, async (req, res) => {
  try {
    const posDevice = (req as any).posDevice as PosDeviceContext;
    const { staffId } = req.params;
    const { pin } = req.body ?? {};

    if (!pin || !PIN_PATTERN.test(pin)) {
      return res.status(400).json({ error: { code: "INVALID_PIN", message: "PIN must be 4-6 digits" } });
    }

    const pool = getPool();
    if (!pool) return res.status(503).json({ error: { code: "SERVICE_UNAVAILABLE", message: "Database unavailable" } });

    // V3-BIZ-026: Check PIN uniqueness (exclude current staff)
    const lookupHash = pinLookupHash(pin, posDevice.storeId);
    const dupCheck = await pool.query(
      `SELECT id FROM platform.store_staff WHERE store_id = $1::uuid AND pin_lookup_hash = $2 AND is_active = true AND id != $3::uuid`,
      [posDevice.storeId, lookupHash, staffId]
    );
    if (dupCheck.rows.length > 0) {
      return res.status(409).json({ error: { code: "PIN_ALREADY_USED", message: "This PIN is already used by another staff member" } });
    }

    const pinHash = await bcrypt.hash(pin, 10);

    const result = await pool.query(
      `UPDATE platform.store_staff SET pin_hash = $1, pin_lookup_hash = $2, failed_login_count = 0, locked_until = NULL, updated_at = NOW()
       WHERE id = $3::uuid AND store_id = $4::uuid
       RETURNING id, name`,
      [pinHash, lookupHash, staffId, posDevice.storeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { code: "STAFF_NOT_FOUND", message: "Staff not found in this store" } });
    }

    res.json({ success: true, staff: result.rows[0] });
  } catch (err) {
    log.error("[POS Staff Manage] reset-pin error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to reset PIN" } });
  }
});

// POST /api/v1/pos/staff/:staffId/toggle-active — activate/deactivate staff
posStaffManageRouter.post("/staff/:staffId/toggle-active", requireDeviceToken, requirePosStaff, async (req, res) => {
  try {
    const posDevice = (req as any).posDevice as PosDeviceContext;
    const { staffId } = req.params;

    const pool = getPool();
    if (!pool) return res.status(503).json({ error: { code: "SERVICE_UNAVAILABLE", message: "Database unavailable" } });

    const result = await pool.query(
      `UPDATE platform.store_staff SET is_active = NOT is_active, updated_at = NOW()
       WHERE id = $1::uuid AND store_id = $2::uuid AND is_owner = false
       RETURNING id, name, is_active`,
      [staffId, posDevice.storeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { code: "STAFF_NOT_FOUND", message: "Staff not found or cannot deactivate owner" } });
    }

    res.json({ staff: result.rows[0] });
  } catch (err) {
    log.error("[POS Staff Manage] toggle-active error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to update staff" } });
  }
});
