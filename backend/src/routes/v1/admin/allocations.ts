/**
 * V3-FIX-187: SuperAdmin allocation dashboard + management
 *
 * Admin can view cross-store allocation summary, drill-down per store,
 * and force-transition allocations.
 */

import { Router, Request, Response } from "express";
import {
  getAllocationSummary,
  listStoreAllocations,
  getAllocation,
  transitionAllocation,
  createAllocation,
} from "../../../services/allocationService";
import type { AllocationStatus } from "../../../services/storeDemandSignal";
import { log } from "../../../lib/logger";
import { asError } from "../../../lib/errorUtils";

export const adminAllocationsRouter = Router();

/**
 * GET /api/v1/admin/allocations/summary
 * Cross-store allocation dashboard — total + by-status breakdown.
 */
adminAllocationsRouter.get("/allocations/summary", async (_req: Request, res: Response) => {
  try {
    const summary = await getAllocationSummary();
    return res.json({ success: true, data: summary });
  } catch (err) {
    log.error("admin:allocations:summary", asError(err).message);
    return res.status(500).json({ error: "Failed to get allocation summary" });
  }
});

/**
 * GET /api/v1/admin/allocations/store/:storeId
 * Per-store allocation list.
 */
adminAllocationsRouter.get("/allocations/store/:storeId", async (req: Request, res: Response) => {
  try {
    const { storeId } = req.params;
    const status = req.query.status as AllocationStatus | undefined;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);
    const offset = parseInt(req.query.offset as string, 10) || 0;

    const result = await listStoreAllocations(storeId, { status, limit, offset });

    return res.json({
      success: true,
      data: result.allocations,
      pagination: { limit, offset, total: result.total },
    });
  } catch (err) {
    log.error("admin:allocations:store", asError(err).message);
    return res.status(500).json({ error: "Failed to list store allocations" });
  }
});

/**
 * GET /api/v1/admin/allocations/:id
 * Get single allocation detail.
 */
adminAllocationsRouter.get("/allocations/:id", async (req: Request, res: Response) => {
  try {
    const allocation = await getAllocation(req.params.id);
    if (!allocation) {
      return res.status(404).json({ error: "Allocation not found" });
    }
    return res.json({ success: true, data: allocation });
  } catch (err) {
    log.error("admin:allocations:get", asError(err).message);
    return res.status(500).json({ error: "Failed to get allocation" });
  }
});

/**
 * POST /api/v1/admin/allocations
 * Create a new allocation (admin-initiated trigger).
 * Body: { retailerOrderId, supplierId, storeId }
 */
adminAllocationsRouter.post("/allocations", async (req: Request, res: Response) => {
  try {
    const { retailerOrderId, supplierId, storeId } = req.body || {};
    if (!retailerOrderId || !supplierId || !storeId) {
      return res.status(400).json({ error: "retailerOrderId, supplierId, storeId required" });
    }

    const allocation = await createAllocation(retailerOrderId, supplierId, storeId);
    return res.status(201).json({ success: true, data: allocation });
  } catch (err) {
    log.error("admin:allocations:create", asError(err).message);
    return res.status(500).json({ error: "Failed to create allocation" });
  }
});

/**
 * PATCH /api/v1/admin/allocations/:id/status
 * Admin force-transition (e.g., marking delivered after manual confirmation).
 * Body: { status, reason? }
 */
adminAllocationsRouter.patch("/allocations/:id/status", async (req: Request, res: Response) => {
  try {
    const { status: newStatus, reason, ...payload } = req.body || {};
    if (!newStatus) {
      return res.status(400).json({ error: "status is required" });
    }

    const result = await transitionAllocation(
      req.params.id,
      newStatus as AllocationStatus,
      "admin",
      { reason, ...payload }
    );

    return res.json({
      success: true,
      data: result.allocation,
      transition: {
        from: result.previousStatus,
        to: result.newStatus,
        eventId: result.eventId,
      },
    });
  } catch (err) {
    const msg = asError(err).message;
    if (msg.includes("Invalid transition")) {
      return res.status(409).json({ error: msg });
    }
    log.error("admin:allocations:transition", msg);
    return res.status(500).json({ error: "Failed to update allocation" });
  }
});
