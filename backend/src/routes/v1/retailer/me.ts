/**
 * RO-005: Cross-Surface Login Linking
 *
 * GET /api/v1/retailer/me
 *
 * Returns the authenticated user's profile and all linked stores.
 * Works across all surfaces (Portal, POS Device, POS Mobile).
 * Resolves: phone → auth.users → auth.store_users → platform.stores
 */

import { Router } from "express";
import { getPool } from "../../../db/client";
import { log } from "../../../lib/logger";

export const retailerMeRouter = Router();

/**
 * GET /api/v1/retailer/me
 *
 * Requires: phone query param (for unauthenticated lookup)
 *           OR x-user-id header (for authenticated requests from gateway)
 *
 * Returns: { ownerUserId, name, phone, stores: [...] }
 */
retailerMeRouter.get("/me", async (req, res) => {
  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "SERVICE_UNAVAILABLE" });
  }

  // Resolve user identity from gateway headers or query
  const userId = (req as any).userId || req.headers["x-user-id"];
  let phone = req.query.phone as string | undefined;

  if (!userId && !phone) {
    return res.status(400).json({
      error: "IDENTITY_REQUIRED",
      message: "Provide x-user-id header or phone query parameter",
    });
  }

  // Normalize phone to match stored format (+91XXXXXXXXXX)
  if (phone) {
    phone = phone.replace(/[\s\-()]/g, "");
    if (/^\d{10}$/.test(phone)) phone = `+91${phone}`;
    else if (/^91\d{10}$/.test(phone)) phone = `+${phone}`;
  }

  try {
    // Find user
    const userQuery = userId
      ? `SELECT id::TEXT, name, phone, email, status, created_at FROM auth.users WHERE id = $1::uuid LIMIT 1`
      : `SELECT id::TEXT, name, phone, email, status, created_at FROM auth.users WHERE phone = $1 LIMIT 1`;
    const userResult = await pool.query(userQuery, [userId || phone]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
        message: "No user found with this identity",
      });
    }

    const user = userResult.rows[0];

    // Find all linked stores
    const storesResult = await pool.query(
      `SELECT
        s.id::TEXT as store_id,
        COALESCE(s.store_code, s.code) as store_code,
        s.name as store_name,
        s.status as store_status,
        s.created_via,
        s.phone as store_phone,
        su.role,
        su.is_owner,
        su.created_at as linked_at
      FROM auth.store_users su
      JOIN platform.stores s ON s.id = su.store_id
      WHERE su.user_id = $1::uuid AND su.is_active = true AND s.status != 'deleted'
      ORDER BY su.is_owner DESC, su.created_at ASC`,
      [user.id]
    );

    const stores = storesResult.rows.map((row: any) => ({
      storeId: row.store_id,
      storeCode: row.store_code,
      storeName: row.store_name,
      storeStatus: row.store_status,
      storePhone: row.store_phone || null,
      createdVia: row.created_via,
      role: row.role,
      isOwner: row.is_owner,
      linkedAt: row.linked_at,
    }));

    // DR-011: Primary store = first owner store, or first linked store
    const primaryStore = stores.find((s: any) => s.isOwner) || stores[0] || null;

    return res.json({
      ownerUserId: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      store: primaryStore,   // DR-011: single-store resolution
      stores,                // Backward compatibility
    });
  } catch (err: any) {
    log.error("[retailer/me] Query failed:", err?.message);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});
