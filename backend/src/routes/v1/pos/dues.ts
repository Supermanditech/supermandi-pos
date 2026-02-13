// POS-DUE-001: Customer Due Management API
// Endpoints: list dues, record partial payment, aging report

import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceToken, type PosDeviceContext } from "../../../middleware/deviceToken";
import { requireActiveStore } from "../../../middleware/storeStatusGate";

export const posDuesRouter = Router();

interface PosRequest extends Request {
  posDevice: PosDeviceContext;
}

/**
 * GET /api/v1/pos/dues
 * List customer dues for the store.
 * Query params:
 *   - status: "pending" | "partial" | "paid" (default: pending,partial)
 *   - phone: filter by customer phone
 *   - limit: number (default 50, max 200)
 *   - offset: number (default 0)
 */
posDuesRouter.get("/dues", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as PosRequest).posDevice;
  const statusFilter = (req.query.status as string) || "pending,partial";
  const phoneFilter = req.query.phone as string | undefined;
  const limit = Math.min(Math.max(1, Number(req.query.limit) || 50), 200);
  const offset = Math.max(0, Number(req.query.offset) || 0);

  try {
    const statuses = statusFilter.split(",").map((s) => s.trim());
    const params: any[] = [storeId, statuses, limit, offset];

    let phoneClause = "";
    if (phoneFilter) {
      phoneClause = "AND customer_phone = $5";
      params.push(phoneFilter);
    }

    const result = await pool.query(
      `SELECT
        id,
        sale_id AS "saleId",
        customer_name AS "customerName",
        customer_phone AS "customerPhone",
        amount_minor AS "amountMinor",
        paid_amount_minor AS "paidAmountMinor",
        (amount_minor - paid_amount_minor) AS "balanceMinor",
        status,
        due_date AS "dueDate",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM payments.customer_dues
      WHERE store_id = $1
        AND status = ANY($2::text[])
        ${phoneClause}
      ORDER BY due_date ASC NULLS LAST, created_at DESC
      LIMIT $3 OFFSET $4`,
      params
    );

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM payments.customer_dues
       WHERE store_id = $1 AND status = ANY($2::text[]) ${phoneClause}`,
      phoneFilter ? [storeId, statuses, phoneFilter] : [storeId, statuses]
    );

    return res.json({
      success: true,
      data: result.rows,
      pagination: {
        total: countResult.rows[0]?.total || 0,
        limit,
        offset,
      },
    });
  } catch (error: any) {
    console.error("[DuesAPI] List error:", error.message);
    return res.status(500).json({ error: "Failed to list dues" });
  }
});

/**
 * POST /api/v1/pos/dues/:dueId/pay
 * Record a partial or full payment on a due.
 * Body: { amountMinor: number }
 */
// BUG-003: Enforce store must be ACTIVE for due payments
posDuesRouter.post("/dues/:dueId/pay", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as PosRequest).posDevice;
  const { dueId } = req.params;
  const { amountMinor } = req.body;

  if (!amountMinor || typeof amountMinor !== "number" || amountMinor <= 0) {
    return res.status(400).json({ error: "amountMinor must be a positive number" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock the due record
    const dueResult = await client.query(
      `SELECT id, amount_minor, paid_amount_minor, status
       FROM payments.customer_dues
       WHERE id = $1 AND store_id = $2
       FOR UPDATE`,
      [dueId, storeId]
    );

    if (dueResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Due not found" });
    }

    const due = dueResult.rows[0];
    if (due.status === "paid") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Due already fully paid" });
    }

    const balance = due.amount_minor - due.paid_amount_minor;
    const paymentAmount = Math.min(amountMinor, balance);
    const newPaid = due.paid_amount_minor + paymentAmount;
    const newStatus = newPaid >= due.amount_minor ? "paid" : "partial";

    await client.query(
      `UPDATE payments.customer_dues
       SET paid_amount_minor = $1, status = $2, updated_at = NOW()
       WHERE id = $3`,
      [newPaid, newStatus, dueId]
    );

    await client.query("COMMIT");

    return res.json({
      success: true,
      data: {
        dueId,
        amountPaid: paymentAmount,
        totalPaid: newPaid,
        balance: due.amount_minor - newPaid,
        status: newStatus,
      },
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("[DuesAPI] Pay error:", error.message);
    return res.status(500).json({ error: "Failed to record payment" });
  } finally {
    client.release();
  }
});

/**
 * GET /api/v1/pos/dues/aging
 * Aging report: group outstanding dues by age buckets.
 * Returns: { current, overdue7, overdue30, overdue90, total }
 */
posDuesRouter.get("/dues/aging", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as PosRequest).posDevice;

  try {
    const result = await pool.query(
      `SELECT
        COALESCE(SUM(CASE WHEN due_date IS NULL OR due_date >= CURRENT_DATE THEN amount_minor - paid_amount_minor ELSE 0 END), 0) AS "current",
        COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - 7 THEN amount_minor - paid_amount_minor ELSE 0 END), 0) AS "overdue7",
        COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE - 7 AND due_date >= CURRENT_DATE - 30 THEN amount_minor - paid_amount_minor ELSE 0 END), 0) AS "overdue30",
        COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE - 30 THEN amount_minor - paid_amount_minor ELSE 0 END), 0) AS "overdue90",
        COALESCE(SUM(amount_minor - paid_amount_minor), 0) AS "total",
        COUNT(*)::int AS "count"
      FROM payments.customer_dues
      WHERE store_id = $1 AND status IN ('pending', 'partial')`,
      [storeId]
    );

    return res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error("[DuesAPI] Aging error:", error.message);
    return res.status(500).json({ error: "Failed to generate aging report" });
  }
});
