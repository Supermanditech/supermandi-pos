// CL-019: Retailer Admin BNPL Routes
// Provides retailer dashboard view of BNPL dues and history
// Mirrors POS BNPL functionality for web dashboard

import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { log } from "../../../lib/logger";
import { asError } from "../../../lib/errorUtils";

export const retailerBnplRouter = Router();

function getStoreId(req: Request): string | null {
  const actorId = req.headers['x-actor-id'];
  return typeof actorId === 'string' ? actorId : null;
}

// =============================================================================
// GET /api/v1/retailer-admin/bnpl/active
// Get active BNPL drawdowns for the store (dues owed to suppliers)
// =============================================================================
retailerBnplRouter.get("/bnpl/active", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreId(req);
  if (!storeId) return res.status(401).json({ error: "Store not identified" });

  try {
    const result = await pool.query(
      `SELECT
        bd.id,
        bd.supplier_id as "supplierId",
        COALESCE(s.business_name, s.trade_name, 'Unknown Supplier') as "supplierName",
        bd.purchase_order_id as "purchaseOrderId",
        bd.principal_minor as "principalMinor",
        bd.due_date as "dueDate",
        bd.status,
        bd.created_at as "createdAt"
      FROM payments.bnpl_drawdowns bd
      JOIN supplier.suppliers s ON s.id = bd.supplier_id
      WHERE bd.store_id = $1
        AND bd.status IN ('active', 'overdue')
      ORDER BY bd.due_date ASC`,
      [storeId]
    );

    // Compute summary
    const totalDue = result.rows.reduce(
      (sum: number, r: any) => sum + Number(r.principalMinor || 0), 0
    );
    const overdueCount = result.rows.filter((r: any) => r.status === 'overdue').length;

    return res.json({
      data: result.rows,
      summary: {
        totalActiveDues: result.rows.length,
        totalDueMinor: totalDue,
        overdueCount,
      },
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[Retailer BNPL] Active dues error:", error.message);
    return res.status(500).json({ error: "Failed to get BNPL dues" });
  }
});

// =============================================================================
// GET /api/v1/retailer-admin/bnpl/history
// Get BNPL payment history (settled and cancelled)
// =============================================================================
retailerBnplRouter.get("/bnpl/history", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreId(req);
  if (!storeId) return res.status(401).json({ error: "Store not identified" });

  const limit = Math.min(parseInt(String(req.query.limit)) || 50, 100);
  const offset = Math.max(parseInt(String(req.query.offset)) || 0, 0);

  try {
    const result = await pool.query(
      `SELECT
        bd.id,
        bd.supplier_id as "supplierId",
        COALESCE(s.business_name, s.trade_name, 'Unknown Supplier') as "supplierName",
        bd.purchase_order_id as "purchaseOrderId",
        bd.principal_minor as "principalMinor",
        bd.due_date as "dueDate",
        bd.status,
        bd.settled_at as "settledAt",
        bd.created_at as "createdAt"
      FROM payments.bnpl_drawdowns bd
      JOIN supplier.suppliers s ON s.id = bd.supplier_id
      WHERE bd.store_id = $1
        AND bd.status IN ('settled', 'cancelled')
      ORDER BY bd.settled_at DESC NULLS LAST, bd.created_at DESC
      LIMIT $2 OFFSET $3`,
      [storeId, limit, offset]
    );

    return res.json({ data: result.rows, total: result.rows.length });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[Retailer BNPL] History error:", error.message);
    return res.status(500).json({ error: "Failed to get BNPL history" });
  }
});

// =============================================================================
// GET /api/v1/retailer-admin/bnpl/summary
// Get BNPL summary (total dues, credit limit, available credit)
// =============================================================================
retailerBnplRouter.get("/bnpl/summary", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreId(req);
  if (!storeId) return res.status(401).json({ error: "Store not identified" });

  try {
    // Get active dues total
    const duesResult = await pool.query(
      `SELECT
        COALESCE(SUM(principal_minor), 0)::bigint as "totalDueMinor",
        COUNT(*)::int as "activeCount"
      FROM payments.bnpl_drawdowns
      WHERE store_id = $1 AND status IN ('active', 'overdue')`,
      [storeId]
    );

    // Get credit limit from approved application
    const creditResult = await pool.query(
      `SELECT
        COALESCE(approved_amount_minor, 0)::bigint as "creditLimitMinor"
      FROM payments.credit_applications
      WHERE store_id = $1 AND status = 'approved'
      ORDER BY created_at DESC LIMIT 1`,
      [storeId]
    );

    const totalDue = Number(duesResult.rows[0]?.totalDueMinor || 0);
    const creditLimit = Number(creditResult.rows[0]?.creditLimitMinor || 0);

    return res.json({
      data: {
        creditLimitMinor: creditLimit,
        totalDueMinor: totalDue,
        availableCreditMinor: Math.max(0, creditLimit - totalDue),
        activeDrawdowns: Number(duesResult.rows[0]?.activeCount || 0),
      },
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[Retailer BNPL] Summary error:", error.message);
    return res.status(500).json({ error: "Failed to get BNPL summary" });
  }
});
