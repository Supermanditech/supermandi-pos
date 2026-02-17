/**
 * RO-007: Registration Events Admin Endpoint
 *
 * GET /api/v1/admin/registration-events
 *
 * Provides SuperAdmin visibility into all registration activity
 * across surfaces (Portal, POS Device, POS Mobile).
 * Supports filtering by source, outcome, store, and date range.
 */

import { Router } from "express";
import { requireAdminToken, requirePermission } from "../../../middleware/adminToken";
import { getPool } from "../../../db/client";
import { createEnrollmentCode } from "../../../services/enrollmentCodeService";  // DRX-003
import { sendEnrollmentCode } from "../../../services/notificationService";  // DRX-003
import { log } from "../../../lib/logger";

export const adminRegistrationEventsRouter = Router();

adminRegistrationEventsRouter.use(requireAdminToken);

/**
 * GET /api/v1/admin/registration-events
 *
 * Query params:
 *   limit   - max rows (default 50, max 200)
 *   offset  - pagination offset (default 0)
 *   source  - filter by source (PORTAL, POS_DEVICE, POS_MOBILE, ADMIN)
 *   outcome - filter by outcome (SUCCESS, IDEMPOTENT, BLOCKED, ERROR)
 *   storeId - filter by store UUID
 *   from    - ISO date (created_at >= from)
 *   to      - ISO date (created_at <= to)
 */
adminRegistrationEventsRouter.get(
  "/registration-events",
  requirePermission("stores", "read"),
  async (req, res) => {
    const pool = getPool();
    if (!pool) {
      return res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const source = req.query.source as string | undefined;
    const outcome = req.query.outcome as string | undefined;
    const storeId = req.query.storeId as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    // Build WHERE clause
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    let paramIdx = 1;

    if (source) {
      conditions.push(`re.source = $${paramIdx++}`);
      params.push(source);
    }
    if (outcome) {
      conditions.push(`re.outcome = $${paramIdx++}`);
      params.push(outcome);
    }
    if (storeId) {
      conditions.push(`re.store_id = $${paramIdx++}::uuid`);
      params.push(storeId);
    }
    if (from) {
      conditions.push(`re.created_at >= $${paramIdx++}::timestamptz`);
      params.push(from);
    }
    if (to) {
      conditions.push(`re.created_at <= $${paramIdx++}::timestamptz`);
      params.push(to);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    try {
      // Count query
      const countResult = await pool.query(
        `SELECT COUNT(*) as total FROM auth.registration_events re ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0].total);

      // Data query with store name join
      const dataResult = await pool.query(
        `SELECT
          re.id,
          re.store_id,
          re.user_id,
          re.source,
          re.outcome,
          re.error_code,
          re.ip_address,
          re.user_agent,
          re.device_meta,
          re.phone,
          re.business_name,
          re.gstin,
          re.created_at,
          s.name as store_name,
          s.code as store_code
        FROM auth.registration_events re
        LEFT JOIN platform.stores s ON s.id = re.store_id
        ${whereClause}
        ORDER BY re.created_at DESC
        LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
        [...params, limit, offset]
      );

      return res.json({
        events: dataResult.rows.map((row) => ({
          id: row.id,
          storeId: row.store_id,
          storeName: row.store_name || null,
          storeCode: row.store_code || null,
          userId: row.user_id,
          source: row.source,
          outcome: row.outcome,
          errorCode: row.error_code || null,
          ipAddress: row.ip_address || null,
          userAgent: row.user_agent || null,
          deviceMeta: row.device_meta || null,
          phone: row.phone,
          businessName: row.business_name,
          gstin: row.gstin || null,
          createdAt: row.created_at,
        })),
        pagination: { total, limit, offset },
      });
    } catch (err: any) {
      log.error("[admin/registration-events] Query failed:", err?.message);
      return res.status(500).json({ error: "QUERY_FAILED" });
    }
  }
);

/**
 * GET /api/v1/admin/registration-events/summary
 *
 * Returns aggregate counts by source and outcome for a dashboard widget.
 * Optional date range via from/to query params.
 */
adminRegistrationEventsRouter.get(
  "/registration-events/summary",
  requirePermission("stores", "read"),
  async (req, res) => {
    const pool = getPool();
    if (!pool) {
      return res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
    }

    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const conditions: string[] = [];
    const params: string[] = [];
    let paramIdx = 1;

    if (from) {
      conditions.push(`created_at >= $${paramIdx++}::timestamptz`);
      params.push(from);
    }
    if (to) {
      conditions.push(`created_at <= $${paramIdx++}::timestamptz`);
      params.push(to);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    try {
      const result = await pool.query(
        `SELECT
          source,
          outcome,
          COUNT(*) as count
        FROM auth.registration_events
        ${whereClause}
        GROUP BY source, outcome
        ORDER BY source, outcome`,
        params
      );

      // Aggregate into structured format
      const bySource: Record<string, Record<string, number>> = {};
      let total = 0;

      for (const row of result.rows) {
        const src = row.source;
        const out = row.outcome;
        const cnt = parseInt(row.count);
        if (!bySource[src]) bySource[src] = {};
        bySource[src][out] = cnt;
        total += cnt;
      }

      return res.json({
        total,
        bySource,
      });
    } catch (err: any) {
      log.error("[admin/registration-events/summary] Query failed:", err?.message);
      return res.status(500).json({ error: "QUERY_FAILED" });
    }
  }
);

/**
 * DRX-003: POST /api/v1/admin/stores/:storeId/send-enrollment-code
 *
 * Generates an enrollment code for the store and sends it to the owner
 * via SMS + Email. Used by SuperAdmin to bridge registration → enrollment.
 */
adminRegistrationEventsRouter.post(
  "/stores/:storeId/send-enrollment-code",
  requirePermission("stores", "write"),
  async (req, res) => {
    const pool = getPool();
    if (!pool) {
      return res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
    }

    const storeId = req.params.storeId;
    if (!storeId) {
      return res.status(400).json({ error: "MISSING_STORE_ID" });
    }

    try {
      // Look up store + owner
      const storeResult = await pool.query(
        `SELECT s.id::TEXT as id, s.name, COALESCE(s.store_code, s.code) as code,
                s.phone, s.email, s.owner_name
         FROM platform.stores s
         WHERE s.id = $1::uuid AND s.status != 'deleted'
         LIMIT 1`,
        [storeId]
      );

      if (storeResult.rows.length === 0) {
        return res.status(404).json({ error: "STORE_NOT_FOUND" });
      }

      const store = storeResult.rows[0];

      if (!store.phone) {
        return res.status(400).json({
          error: "NO_PHONE",
          message: "Store has no phone number — cannot send enrollment code",
        });
      }

      // Generate enrollment code
      const enrollment = await createEnrollmentCode(
        store.id,
        store.code || "",
        "superadmin"
      );

      // Send notification (non-blocking errors)
      const notification = await sendEnrollmentCode({
        phone: store.phone,
        email: store.email || undefined,
        ownerName: store.owner_name || store.name,
        storeCode: store.code || "",
        enrollmentCode: enrollment.code,
        expiresAt: enrollment.expiresAt,
      });

      log.info(
        `[DRX-003] Enrollment code ${enrollment.code} sent for store ${storeId} — SMS: ${notification.smsSent}, Email: ${notification.emailSent}`
      );

      return res.json({
        enrollmentCode: enrollment.code,
        expiresAt: enrollment.expiresAt,
        qrPayload: enrollment.qrPayload,
        notification: {
          smsSent: notification.smsSent,
          emailSent: notification.emailSent,
          smsError: notification.smsError || null,
          emailError: notification.emailError || null,
        },
      });
    } catch (err: any) {
      log.error("[DRX-003] Send enrollment code failed:", err?.message);
      return res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);
