// GCP-STG-0106: Supplier Settlement History
// Read-only view of settlement records for the authenticated supplier

import { Router, Response, NextFunction } from "express";
import { getPool } from "../../../db/client";
import { requireSupplierAuth, SupplierAuthRequest } from "./auth";
import { getSupplierSettlements } from "../../../services/settlementService";

export const supplierSettlementsRouter = Router();

/**
 * GET /api/v1/supplier/settlements
 * List settlement records for this supplier with summary
 */
supplierSettlementsRouter.get("/", requireSupplierAuth, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    if (!pool) { res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database unavailable" } }); return; }

    const supplierId = req.supplierId;
    if (!supplierId) { res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Supplier auth required" } }); return; }

    const limit = Math.min(parseInt(String(req.query.limit)) || 50, 100);
    const offset = Math.max(parseInt(String(req.query.offset)) || 0, 0);

    const result = await getSupplierSettlements(pool, supplierId, limit, offset);

    res.json({
      data: result.data,
      total: result.total,
      summary: result.summary,
    });
  } catch (err: any) {
    // Graceful fallback if table doesn't exist yet
    if (err?.code === "42P01") {
      res.json({ data: [], total: 0, summary: { totalPendingMinor: 0, totalApprovedMinor: 0, totalPaidMinor: 0, pendingCount: 0, approvedCount: 0, paidCount: 0 } });
      return;
    }
    next(err);
  }
});
