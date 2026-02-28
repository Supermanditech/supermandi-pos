// SA-P1-001: SuperAdmin store staff CRUD endpoints
import { Router } from "express";
import bcrypt from "bcryptjs";
import { requireAdminToken, requirePermission } from "../../../middleware/adminToken";
import { getPool } from "../../../db/client";
import { log } from "../../../lib/logger";

export const adminStaffRouter = Router();

adminStaffRouter.use(requireAdminToken);

const VALID_ROLES = ["CASHIER", "STOCK_MANAGER", "MANAGER"] as const;
const PHONE_PATTERN = /^\d{10}$/;
const PIN_PATTERN = /^\d{4,6}$/;

// GET /admin/stores/:storeId/staff — list staff for a store
adminStaffRouter.get(
  "/stores/:storeId/staff",
  requirePermission("stores", "read"),
  async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "Database unavailable" });

    const { storeId } = req.params;
    const { active } = req.query; // ?active=true|false

    // XPORT-002: Add store_id to subqueries for store isolation
    let query = `
      SELECT s.id, s.name, s.phone, s.role, s.is_active, s.created_at,
        (SELECT COUNT(*)::int FROM sales WHERE staff_id = s.id AND store_id = s.store_id) AS sales_count,
        (SELECT COUNT(*)::int FROM purchases WHERE staff_id = s.id AND store_id = s.store_id) AS stock_in_count
      FROM platform.store_staff s
      WHERE s.store_id = $1::uuid
    `;
    const params: any[] = [storeId];

    if (active === "true") {
      query += ` AND s.is_active = true`;
    } else if (active === "false") {
      query += ` AND s.is_active = false`;
    }

    query += ` ORDER BY s.created_at DESC`;

    try {
      const result = await pool.query(query, params);
      return res.json({ staff: result.rows });
    } catch (err) {
      log.error("[Admin Staff] List error:", err);
      return res.status(500).json({ error: "Failed to list staff" });
    }
  }
);

// POST /admin/stores/:storeId/staff — create a staff member
adminStaffRouter.post(
  "/stores/:storeId/staff",
  requirePermission("stores", "update"),
  async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "Database unavailable" });

    const { storeId } = req.params;
    const { name, phone, pin, role } = req.body ?? {};

    // Validate inputs
    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return res.status(400).json({ error: { code: "INVALID_NAME", message: "Name must be at least 2 characters" } });
    }
    if (!phone || typeof phone !== "string" || !PHONE_PATTERN.test(phone.trim())) {
      return res.status(400).json({ error: { code: "INVALID_PHONE", message: "Phone must be 10 digits" } });
    }
    if (!pin || typeof pin !== "string" || !PIN_PATTERN.test(pin)) {
      return res.status(400).json({ error: { code: "INVALID_PIN", message: "PIN must be 4-6 digits" } });
    }
    if (!role || !VALID_ROLES.includes(role as any)) {
      return res.status(400).json({ error: { code: "INVALID_ROLE", message: `Role must be one of: ${VALID_ROLES.join(", ")}` } });
    }

    try {
      // Check for duplicate phone in same store
      const existing = await pool.query(
        `SELECT id FROM platform.store_staff WHERE store_id = $1::uuid AND phone = $2`,
        [storeId, phone.trim()]
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: { code: "PHONE_EXISTS", message: "A staff member with this phone already exists in this store" } });
      }

      const pinHash = await bcrypt.hash(pin, 10);

      const result = await pool.query(
        `INSERT INTO platform.store_staff (store_id, name, phone, pin_hash, role)
         VALUES ($1::uuid, $2, $3, $4, $5)
         RETURNING id, name, phone, role, is_active, created_at`,
        [storeId, name.trim(), phone.trim(), pinHash, role]
      );

      return res.status(201).json({ staff: result.rows[0] });
    } catch (err) {
      log.error("[Admin Staff] Create error:", err);
      return res.status(500).json({ error: "Failed to create staff" });
    }
  }
);

// PATCH /admin/stores/:storeId/staff/:staffId — update staff (name, role, is_active)
adminStaffRouter.patch(
  "/stores/:storeId/staff/:staffId",
  requirePermission("stores", "update"),
  async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "Database unavailable" });

    const { storeId, staffId } = req.params;
    const { name, role, is_active } = req.body ?? {};

    const updates: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length < 2) {
        return res.status(400).json({ error: { code: "INVALID_NAME", message: "Name must be at least 2 characters" } });
      }
      updates.push(`name = $${paramIdx++}`);
      params.push(name.trim());
    }

    if (role !== undefined) {
      if (!VALID_ROLES.includes(role as any)) {
        return res.status(400).json({ error: { code: "INVALID_ROLE", message: `Role must be one of: ${VALID_ROLES.join(", ")}` } });
      }
      updates.push(`role = $${paramIdx++}`);
      params.push(role);
    }

    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIdx++}`);
      params.push(Boolean(is_active));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: { code: "NO_UPDATES", message: "No fields to update" } });
    }

    params.push(staffId);
    params.push(storeId);

    try {
      const result = await pool.query(
        `UPDATE platform.store_staff SET ${updates.join(", ")}
         WHERE id = $${paramIdx++} AND store_id = $${paramIdx}::uuid
         RETURNING id, name, phone, role, is_active, created_at`,
        params
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Staff member not found" } });
      }

      return res.json({ staff: result.rows[0] });
    } catch (err) {
      log.error("[Admin Staff] Update error:", err);
      return res.status(500).json({ error: "Failed to update staff" });
    }
  }
);

// POST /admin/stores/:storeId/staff/:staffId/reset-pin — reset staff PIN
adminStaffRouter.post(
  "/stores/:storeId/staff/:staffId/reset-pin",
  requirePermission("stores", "update"),
  async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "Database unavailable" });

    const { storeId, staffId } = req.params;
    const { pin } = req.body ?? {};

    if (!pin || typeof pin !== "string" || !PIN_PATTERN.test(pin)) {
      return res.status(400).json({ error: { code: "INVALID_PIN", message: "PIN must be 4-6 digits" } });
    }

    try {
      const pinHash = await bcrypt.hash(pin, 10);

      const result = await pool.query(
        `UPDATE platform.store_staff SET pin_hash = $1
         WHERE id = $2 AND store_id = $3::uuid
         RETURNING id`,
        [pinHash, staffId, storeId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Staff member not found" } });
      }

      return res.json({ success: true });
    } catch (err) {
      log.error("[Admin Staff] Reset PIN error:", err);
      return res.status(500).json({ error: "Failed to reset PIN" });
    }
  }
);
