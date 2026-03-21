// GCP-STG-0089: Admin Demand Aggregation + Consolidated PO Routes

import { Router } from "express";
import { getPool } from "../../../db/client";
import { requireAdminToken, requirePermission } from "../../../middleware/adminToken";
import {
  aggregateDemandBySupplier,
  createConsolidatedPO,
  submitConsolidatedPO,
  updateConsolidatedPOStatus,
  listConsolidatedPOs,
  getConsolidatedPOItems,
} from "../../../services/demandAggregationService";
import { log } from "../../../lib/logger";

export const adminDemandAggregationRouter = Router();

/**
 * GET /api/v1/admin/demand/aggregate/:supplierId
 * Aggregate demand across stores for a supplier's products
 */
adminDemandAggregationRouter.get("/demand/aggregate/:supplierId", requireAdminToken, requirePermission("demand_signals", "read"), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    const demand = await aggregateDemandBySupplier(pool, req.params.supplierId, {
      minStores: parseInt(req.query.minStores as string) || 1,
      reorderThresholdDays: parseInt(req.query.threshold as string) || 7,
    });

    return res.json({
      success: true,
      data: demand,
      totalProducts: demand.length,
      totalDemandUnits: demand.reduce((sum, d) => sum + d.totalDemand, 0),
    });
  } catch (err: any) {
    log.error("[admin/demand/aggregate] Error:", err);
    if (err.code === "42P01") return res.json({ success: true, data: [], totalProducts: 0, totalDemandUnits: 0 });
    return res.status(500).json({ error: "Failed to aggregate demand" });
  }
});

/**
 * POST /api/v1/admin/demand/consolidated-po
 * Create a consolidated PO from aggregated demand
 */
adminDemandAggregationRouter.post("/demand/consolidated-po", requireAdminToken, requirePermission("demand_signals", "read"), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { supplierId, items } = req.body || {};
  if (!supplierId) return res.status(400).json({ error: "supplierId is required" });
  if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "items array required" });

  const adminId = (req as any).adminId;

  try {
    const po = await createConsolidatedPO(pool, supplierId, items, adminId);
    return res.status(201).json({ success: true, data: po });
  } catch (err: any) {
    log.error("[admin/demand/consolidated-po] Error:", err);
    return res.status(500).json({ error: err.message || "Failed to create consolidated PO" });
  }
});

/**
 * POST /api/v1/admin/demand/consolidated-po/:id/submit
 * Submit a consolidated PO to the supplier
 */
adminDemandAggregationRouter.post("/demand/consolidated-po/:id/submit", requireAdminToken, requirePermission("demand_signals", "read"), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    await submitConsolidatedPO(pool, req.params.id);
    return res.json({ success: true, message: "Consolidated PO submitted" });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || "Failed to submit" });
  }
});

/**
 * PATCH /api/v1/admin/demand/consolidated-po/:id/status
 * Update consolidated PO status (confirmed, dispatched, delivered, cancelled)
 */
adminDemandAggregationRouter.patch("/demand/consolidated-po/:id/status", requireAdminToken, requirePermission("demand_signals", "read"), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { status, trackingNumber, carrier, expectedDeliveryDate } = req.body || {};
  if (!status) return res.status(400).json({ error: "status is required" });

  try {
    await updateConsolidatedPOStatus(pool, req.params.id, status, { trackingNumber, carrier, expectedDeliveryDate });
    return res.json({ success: true, message: `Status updated to ${status}` });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || "Failed to update status" });
  }
});

/**
 * GET /api/v1/admin/demand/consolidated-pos
 * List consolidated POs with filters
 */
adminDemandAggregationRouter.get("/demand/consolidated-pos", requireAdminToken, requirePermission("demand_signals", "read"), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    const result = await listConsolidatedPOs(pool, {
      supplierId: req.query.supplierId as string,
      status: req.query.status as string,
      limit: parseInt(req.query.limit as string) || 50,
      offset: parseInt(req.query.offset as string) || 0,
    });
    return res.json({ success: true, ...result });
  } catch (err: any) {
    log.error("[admin/demand/consolidated-pos] Error:", err);
    if (err.code === "42P01") return res.json({ success: true, data: [], total: 0 });
    return res.status(500).json({ error: "Failed to list consolidated POs" });
  }
});

/**
 * GET /api/v1/admin/demand/consolidated-po/:id/items
 * Get items for a consolidated PO (with per-store breakdown)
 */
adminDemandAggregationRouter.get("/demand/consolidated-po/:id/items", requireAdminToken, requirePermission("demand_signals", "read"), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    const items = await getConsolidatedPOItems(pool, req.params.id);
    return res.json({ success: true, data: items });
  } catch (err: any) {
    log.error("[admin/demand/consolidated-po/items] Error:", err);
    return res.status(500).json({ error: "Failed to get items" });
  }
});
