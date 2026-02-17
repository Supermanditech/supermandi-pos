// POS-SHIFT-001: Staff Shift Management API
// Endpoints: current shift, start, end, history

import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceToken, type PosDeviceContext } from "../../../middleware/deviceToken";
import { requireActiveStore } from "../../../middleware/storeStatusGate";
import { log } from "../../../lib/logger";
import { asError } from "../../../lib/errorUtils";

export const posShiftsRouter = Router();

interface PosRequest extends Request {
  posDevice: PosDeviceContext;
}

/**
 * GET /api/v1/pos/shifts/current
 * Get the current active shift for this store.
 * Active shift = shift_end IS NULL.
 */
posShiftsRouter.get("/shifts/current", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as PosRequest).posDevice;

  try {
    const result = await pool.query(
      `SELECT
        id,
        store_id AS "storeId",
        staff_user_id AS "staffUserId",
        shift_start AS "shiftStart",
        shift_end AS "shiftEnd",
        opening_cash_minor AS "openingCashMinor",
        closing_cash_minor AS "closingCashMinor",
        sales_count AS "salesCount",
        sales_total_minor AS "salesTotalMinor",
        notes,
        created_at AS "createdAt"
      FROM platform.staff_shifts
      WHERE store_id = $1 AND shift_end IS NULL
      ORDER BY shift_start DESC
      LIMIT 1`,
      [storeId]
    );

    return res.json({ shift: result.rows[0] || null });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[ShiftsAPI] Get current error:", error.message);
    return res.status(500).json({ error: "Failed to get current shift" });
  }
});

/**
 * POST /api/v1/pos/shifts/start
 * Start a new shift. Requires no active shift for this store.
 * Body: { openingCashMinor: number, staffUserId?: string }
 */
posShiftsRouter.post("/shifts/start", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as PosRequest).posDevice;
  const { openingCashMinor, staffUserId } = req.body;

  if (openingCashMinor === undefined || typeof openingCashMinor !== "number" || openingCashMinor < 0) {
    return res.status(400).json({ error: "openingCashMinor must be a non-negative number" });
  }

  const staffId = staffUserId || (req as PosRequest).posDevice.deviceId;

  try {
    // Check for existing active shift
    const existing = await pool.query(
      `SELECT id FROM platform.staff_shifts
       WHERE store_id = $1 AND shift_end IS NULL
       LIMIT 1`,
      [storeId]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: "Active shift already exists",
        activeShiftId: existing.rows[0].id,
      });
    }

    const result = await pool.query(
      `INSERT INTO platform.staff_shifts
        (store_id, staff_user_id, opening_cash_minor)
      VALUES ($1, $2, $3)
      RETURNING
        id,
        store_id AS "storeId",
        staff_user_id AS "staffUserId",
        shift_start AS "shiftStart",
        shift_end AS "shiftEnd",
        opening_cash_minor AS "openingCashMinor",
        closing_cash_minor AS "closingCashMinor",
        sales_count AS "salesCount",
        sales_total_minor AS "salesTotalMinor",
        notes,
        created_at AS "createdAt"`,
      [storeId, staffId, openingCashMinor]
    );

    return res.status(201).json({ shift: result.rows[0] });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[ShiftsAPI] Start error:", error.message);
    return res.status(500).json({ error: "Failed to start shift" });
  }
});

/**
 * POST /api/v1/pos/shifts/:shiftId/end
 * End an active shift. Computes expected cash from sales during shift.
 * Body: { closingCashMinor: number, notes?: string }
 */
posShiftsRouter.post("/shifts/:shiftId/end", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as PosRequest).posDevice;
  const { shiftId } = req.params;
  const { closingCashMinor, notes } = req.body;

  if (closingCashMinor === undefined || typeof closingCashMinor !== "number" || closingCashMinor < 0) {
    return res.status(400).json({ error: "closingCashMinor must be a non-negative number" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock and fetch the shift
    const shiftResult = await client.query(
      `SELECT id, shift_start, shift_end, opening_cash_minor
       FROM platform.staff_shifts
       WHERE id = $1 AND store_id = $2
       FOR UPDATE`,
      [shiftId, storeId]
    );

    if (shiftResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Shift not found" });
    }

    const shift = shiftResult.rows[0];
    if (shift.shift_end !== null) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Shift is already closed" });
    }

    // Compute expected cash: opening + cash sales during shift
    const salesResult = await client.query(
      `SELECT
        COALESCE(SUM(CASE WHEN payment_mode = 'CASH' THEN total_minor ELSE 0 END), 0)::bigint AS cash_sales,
        COUNT(*)::int AS sales_count,
        COALESCE(SUM(total_minor), 0)::bigint AS sales_total
      FROM public.sales
      WHERE store_id = $1
        AND created_at >= $2
        AND created_at <= NOW()
        AND status = 'completed'`,
      [storeId, shift.shift_start]
    );

    const cashSales = BigInt(salesResult.rows[0].cash_sales);
    const openingCash = BigInt(shift.opening_cash_minor);
    const expectedCash = openingCash + cashSales;
    const closingCash = BigInt(closingCashMinor);
    const variance = closingCash - expectedCash;

    // Update shift: close it
    const updateResult = await client.query(
      `UPDATE platform.staff_shifts
       SET shift_end = NOW(),
           closing_cash_minor = $1,
           sales_count = $2,
           sales_total_minor = $3,
           notes = COALESCE($4, notes)
       WHERE id = $5
       RETURNING
         id,
         store_id AS "storeId",
         staff_user_id AS "staffUserId",
         shift_start AS "shiftStart",
         shift_end AS "shiftEnd",
         opening_cash_minor AS "openingCashMinor",
         closing_cash_minor AS "closingCashMinor",
         sales_count AS "salesCount",
         sales_total_minor AS "salesTotalMinor",
         notes,
         created_at AS "createdAt"`,
      [
        closingCashMinor,
        salesResult.rows[0].sales_count,
        salesResult.rows[0].sales_total,
        notes || null,
        shiftId,
      ]
    );

    await client.query("COMMIT");

    return res.json({
      shift: {
        ...updateResult.rows[0],
        expectedCashMinor: expectedCash.toString(),
        varianceMinor: variance.toString(),
      },
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    await client.query("ROLLBACK");
    log.error("[ShiftsAPI] End error:", error.message);
    return res.status(500).json({ error: "Failed to end shift" });
  } finally {
    client.release();
  }
});

/**
 * GET /api/v1/pos/shifts/history
 * List past shifts (both active and closed) for this store.
 * Query params: ?limit=50
 */
posShiftsRouter.get("/shifts/history", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as PosRequest).posDevice;
  const limit = Math.min(Math.max(1, Number(req.query.limit) || 50), 200);

  try {
    const result = await pool.query(
      `SELECT
        id,
        store_id AS "storeId",
        staff_user_id AS "staffUserId",
        shift_start AS "shiftStart",
        shift_end AS "shiftEnd",
        opening_cash_minor AS "openingCashMinor",
        closing_cash_minor AS "closingCashMinor",
        sales_count AS "salesCount",
        sales_total_minor AS "salesTotalMinor",
        notes,
        created_at AS "createdAt"
      FROM platform.staff_shifts
      WHERE store_id = $1
      ORDER BY shift_start DESC
      LIMIT $2`,
      [storeId, limit]
    );

    return res.json({ shifts: result.rows });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[ShiftsAPI] History error:", error.message);
    return res.status(500).json({ error: "Failed to get shift history" });
  }
});
