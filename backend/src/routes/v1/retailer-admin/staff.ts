/**
 * V3-API-019: Retailer-owner staff CRUD for retailer web
 * Endpoints for store owner to manage staff from retailer-admin portal.
 * Store ownership enforced by middleware (requireStoreOwnership).
 */

import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { getPool } from "../../../db/client";
import { log } from "../../../lib/logger";

export const retailerAdminStaffRouter = Router();

const VALID_ROLES = ["CASHIER", "STOCK_MANAGER", "MANAGER"] as const;
const PIN_PATTERN = /^\d{4,6}$/;

function pinLookupHash(pin: string, storeId: string): string {
  return crypto.createHash("sha256").update(`${storeId}:${pin}`).digest("hex");
}

// GET /retailer-admin/staff — list staff for the owner's store
retailerAdminStaffRouter.get("/staff", async (req, res) => {
  try {
    const storeId = (req as any).storeId;
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: { code: "SERVICE_UNAVAILABLE", message: "Database unavailable" } });

    const result = await pool.query(
      `SELECT id, name, phone, role, is_active, is_owner, last_login_at, created_at, updated_at
       FROM platform.store_staff
       WHERE store_id = $1::uuid
       ORDER BY is_owner DESC, created_at ASC`,
      [storeId]
    );

    res.json({ staff: result.rows });
  } catch (err) {
    log.error("[RetailerAdmin Staff] list error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to list staff" } });
  }
});

// POST /retailer-admin/staff — create new staff
retailerAdminStaffRouter.post("/staff", async (req, res) => {
  try {
    const storeId = (req as any).storeId;
    const { name, pin, role, phone } = req.body ?? {};

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return res.status(400).json({ error: { code: "INVALID_NAME", message: "Name must be at least 2 characters" } });
    }
    if (!pin || !PIN_PATTERN.test(pin)) {
      return res.status(400).json({ error: { code: "INVALID_PIN", message: "PIN must be 4-6 digits" } });
    }
    if (!role || !VALID_ROLES.includes(role as any)) {
      return res.status(400).json({ error: { code: "INVALID_ROLE", message: `Role must be: ${VALID_ROLES.join(", ")}` } });
    }

    const pool = getPool();
    if (!pool) return res.status(503).json({ error: { code: "SERVICE_UNAVAILABLE", message: "Database unavailable" } });

    // V3-BIZ-026: Check PIN uniqueness within store
    const lookupHash = pinLookupHash(pin, storeId);
    const dupCheck = await pool.query(
      `SELECT id FROM platform.store_staff WHERE store_id = $1::uuid AND pin_lookup_hash = $2 AND is_active = true`,
      [storeId, lookupHash]
    );
    if (dupCheck.rows.length > 0) {
      return res.status(409).json({ error: { code: "PIN_ALREADY_USED", message: "This PIN is already used by another staff member" } });
    }

    const pinHash = await bcrypt.hash(pin, 10);

    const result = await pool.query(
      `INSERT INTO platform.store_staff (store_id, name, phone, pin_hash, pin_lookup_hash, role, is_active, is_owner)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, true, false)
       RETURNING id, name, phone, role, is_active, created_at`,
      [storeId, name.trim(), phone?.trim() || null, pinHash, lookupHash, role]
    );

    res.status(201).json({ staff: result.rows[0] });
  } catch (err) {
    log.error("[RetailerAdmin Staff] create error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to create staff" } });
  }
});

// PATCH /retailer-admin/staff/:staffId — update staff name/role/active
retailerAdminStaffRouter.patch("/staff/:staffId", async (req, res) => {
  try {
    const storeId = (req as any).storeId;
    const { staffId } = req.params;
    const { name, role, is_active } = req.body ?? {};

    const pool = getPool();
    if (!pool) return res.status(503).json({ error: { code: "SERVICE_UNAVAILABLE", message: "Database unavailable" } });

    const sets: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (name && typeof name === "string" && name.trim().length >= 2) {
      sets.push(`name = $${paramIdx++}`);
      params.push(name.trim());
    }
    if (role && VALID_ROLES.includes(role as any)) {
      sets.push(`role = $${paramIdx++}`);
      params.push(role);
    }
    if (typeof is_active === "boolean") {
      sets.push(`is_active = $${paramIdx++}`);
      params.push(is_active);
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: { code: "NO_CHANGES", message: "No valid fields to update" } });
    }

    sets.push(`updated_at = NOW()`);
    params.push(staffId, storeId);

    const result = await pool.query(
      `UPDATE platform.store_staff SET ${sets.join(", ")} WHERE id = $${paramIdx}::uuid AND store_id = $${paramIdx + 1}::uuid AND is_owner = false
       RETURNING id, name, role, is_active, updated_at`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { code: "STAFF_NOT_FOUND", message: "Staff not found or cannot modify owner" } });
    }

    res.json({ staff: result.rows[0] });
  } catch (err) {
    log.error("[RetailerAdmin Staff] update error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to update staff" } });
  }
});

// POST /retailer-admin/staff/:staffId/reset-pin — reset staff PIN
retailerAdminStaffRouter.post("/staff/:staffId/reset-pin", async (req, res) => {
  try {
    const storeId = (req as any).storeId;
    const { staffId } = req.params;
    const { pin } = req.body ?? {};

    if (!pin || !PIN_PATTERN.test(pin)) {
      return res.status(400).json({ error: { code: "INVALID_PIN", message: "PIN must be 4-6 digits" } });
    }

    const pool = getPool();
    if (!pool) return res.status(503).json({ error: { code: "SERVICE_UNAVAILABLE", message: "Database unavailable" } });

    // V3-BIZ-026: Check PIN uniqueness
    const lookupHash = pinLookupHash(pin, storeId);
    const dupCheck = await pool.query(
      `SELECT id FROM platform.store_staff WHERE store_id = $1::uuid AND pin_lookup_hash = $2 AND is_active = true AND id != $3::uuid`,
      [storeId, lookupHash, staffId]
    );
    if (dupCheck.rows.length > 0) {
      return res.status(409).json({ error: { code: "PIN_ALREADY_USED", message: "This PIN is already used by another staff member" } });
    }

    const pinHash = await bcrypt.hash(pin, 10);

    const result = await pool.query(
      `UPDATE platform.store_staff SET pin_hash = $1, pin_lookup_hash = $2, failed_login_count = 0, locked_until = NULL, updated_at = NOW()
       WHERE id = $3::uuid AND store_id = $4::uuid
       RETURNING id, name`,
      [pinHash, lookupHash, staffId, storeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { code: "STAFF_NOT_FOUND", message: "Staff not found" } });
    }

    res.json({ success: true, staff: result.rows[0] });
  } catch (err) {
    log.error("[RetailerAdmin Staff] reset-pin error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to reset PIN" } });
  }
});

// POST /retailer-admin/staff/owner-pin — set/reset owner's POS quick PIN
retailerAdminStaffRouter.post("/staff/owner-pin", async (req, res) => {
  try {
    const storeId = (req as any).storeId;
    const userId = (req as any).userId;
    const { pin } = req.body ?? {};

    if (!pin || !PIN_PATTERN.test(pin)) {
      return res.status(400).json({ error: { code: "INVALID_PIN", message: "PIN must be 4-6 digits" } });
    }

    const pool = getPool();
    if (!pool) return res.status(503).json({ error: { code: "SERVICE_UNAVAILABLE", message: "Database unavailable" } });

    // V3-BIZ-026: Check PIN uniqueness across ALL staff (including non-owner)
    const lookupHash = pinLookupHash(pin, storeId);
    const dupCheck = await pool.query(
      `SELECT id FROM platform.store_staff WHERE store_id = $1::uuid AND pin_lookup_hash = $2 AND is_active = true AND is_owner = false`,
      [storeId, lookupHash]
    );
    if (dupCheck.rows.length > 0) {
      return res.status(409).json({ error: { code: "PIN_ALREADY_USED", message: "This PIN is already used by a staff member. Owner and staff cannot share PINs." } });
    }

    const pinHash = await bcrypt.hash(pin, 10);

    // Upsert owner staff identity
    const result = await pool.query(
      `INSERT INTO platform.store_staff (store_id, name, pin_hash, pin_lookup_hash, role, is_active, is_owner, owner_user_id)
       VALUES ($1::uuid, 'Store Owner', $2, $3, 'MANAGER', true, true, $4::uuid)
       ON CONFLICT ON CONSTRAINT store_staff_owner_uq
       DO UPDATE SET pin_hash = $2, pin_lookup_hash = $3, failed_login_count = 0, locked_until = NULL, updated_at = NOW()
       RETURNING id, name, role`,
      [storeId, pinHash, lookupHash, userId]
    );

    res.json({ success: true, owner: result.rows[0] });
  } catch (err) {
    log.error("[RetailerAdmin Staff] owner-pin error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to set owner PIN" } });
  }
});
