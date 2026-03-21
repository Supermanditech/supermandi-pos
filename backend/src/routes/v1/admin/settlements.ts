// GCP-STG-0106: Admin Settlement Routes
// Dashboard for managing supplier payouts (pending/approved/paid)

import { Router } from "express";
import { getPool } from "../../../db/client";
import { requireAdminToken, requirePermission } from "../../../middleware/adminToken";
import {
  listSettlements,
  getSettlementSummary,
  approveSettlement,
  bulkApproveSettlements,
  markSettlementPaid,
} from "../../../services/settlementService";
import { log } from "../../../lib/logger";

export const adminSettlementsRouter = Router();

/**
 * GET /api/v1/admin/settlements
 * List settlements with filters (supplier, status, date range)
 */
adminSettlementsRouter.get("/settlements", requireAdminToken, requirePermission("products", "read"), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    const result = await listSettlements(pool, {
      supplierId: req.query.supplierId as string,
      storeId: req.query.storeId as string,
      status: req.query.status as string,
      billingModel: req.query.billingModel as string,
      fromDate: req.query.fromDate as string,
      toDate: req.query.toDate as string,
      limit: parseInt(req.query.limit as string) || 50,
      offset: parseInt(req.query.offset as string) || 0,
    });

    return res.json({ success: true, ...result });
  } catch (err: any) {
    log.error("[admin/settlements] Error:", err);
    if (err.code === "42P01") {
      return res.json({ success: true, data: [], total: 0 });
    }
    return res.status(500).json({ error: "Failed to list settlements" });
  }
});

/**
 * GET /api/v1/admin/settlements/summary
 * Global or per-supplier settlement summary
 */
adminSettlementsRouter.get("/settlements/summary", requireAdminToken, requirePermission("products", "read"), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    const summary = await getSettlementSummary(pool, req.query.supplierId as string);
    return res.json({ success: true, data: summary });
  } catch (err: any) {
    log.error("[admin/settlements/summary] Error:", err);
    if (err.code === "42P01") {
      return res.json({
        success: true,
        data: { totalPendingMinor: 0, totalApprovedMinor: 0, totalPaidMinor: 0, pendingCount: 0, approvedCount: 0, paidCount: 0 },
      });
    }
    return res.status(500).json({ error: "Failed to get settlement summary" });
  }
});

/**
 * POST /api/v1/admin/settlements/:id/approve
 * Approve a pending settlement for payout
 */
adminSettlementsRouter.post("/settlements/:id/approve", requireAdminToken, requirePermission("products", "approve"), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const adminId = (req as any).adminId;
  if (!adminId) return res.status(401).json({ error: "Admin ID required" });

  try {
    await approveSettlement(pool, req.params.id, adminId);
    return res.json({ success: true, message: "Settlement approved" });
  } catch (err: any) {
    log.error("[admin/settlements/approve] Error:", err);
    return res.status(400).json({ error: err.message || "Failed to approve" });
  }
});

/**
 * POST /api/v1/admin/settlements/bulk-approve
 * Approve all pending settlements for a supplier
 */
adminSettlementsRouter.post("/settlements/bulk-approve", requireAdminToken, requirePermission("products", "approve"), async (req, res) => {
  const { supplierId } = req.body || {};
  if (!supplierId) return res.status(400).json({ error: "supplierId is required" });

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const adminId = (req as any).adminId;
  if (!adminId) return res.status(401).json({ error: "Admin ID required" });

  try {
    const count = await bulkApproveSettlements(pool, supplierId, adminId);
    return res.json({ success: true, approvedCount: count });
  } catch (err: any) {
    log.error("[admin/settlements/bulk-approve] Error:", err);
    return res.status(500).json({ error: "Failed to bulk approve" });
  }
});

/**
 * POST /api/v1/admin/settlements/:id/mark-paid
 * Mark settlement as paid (after manual payout or Razorpay confirmation)
 */
adminSettlementsRouter.post("/settlements/:id/mark-paid", requireAdminToken, requirePermission("products", "approve"), async (req, res) => {
  const { payoutReference, payoutUtr, payoutMethod } = req.body || {};
  if (!payoutReference) return res.status(400).json({ error: "payoutReference is required" });

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    await markSettlementPaid(pool, req.params.id, payoutReference, payoutUtr, payoutMethod);
    return res.json({ success: true, message: "Settlement marked as paid" });
  } catch (err: any) {
    log.error("[admin/settlements/mark-paid] Error:", err);
    return res.status(400).json({ error: err.message || "Failed to mark as paid" });
  }
});
