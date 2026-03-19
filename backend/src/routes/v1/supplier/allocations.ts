/**
 * V3-FIX-187: Supplier allocation management endpoints
 *
 * Suppliers can view, accept, reject, dispatch allocations.
 */

import { Router, Response, NextFunction } from "express";
import { requireSupplierAuth, SupplierAuthRequest } from "./auth";
import { requireActiveSupplier } from "../../../middleware/supplierStatusGate";
import {
  listSupplierAllocations,
  getAllocation,
  transitionAllocation,
  type AllocationRecord,
} from "../../../services/allocationService";
import type { AllocationStatus } from "../../../services/storeDemandSignal";
import { log } from "../../../lib/logger";
import { asError } from "../../../lib/errorUtils";

export const supplierAllocationsRouter = Router();

/**
 * GET /api/v1/supplier/allocations
 * List allocations for the authenticated supplier.
 */
supplierAllocationsRouter.get(
  "/allocations",
  requireSupplierAuth,
  requireActiveSupplier,
  async (req: SupplierAuthRequest, res: Response) => {
    try {
      const supplierId = req.supplier!.id;
      const status = req.query.status as AllocationStatus | undefined;
      const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);
      const offset = parseInt(req.query.offset as string, 10) || 0;

      const result = await listSupplierAllocations(supplierId, { status, limit, offset });

      return res.json({
        success: true,
        data: result.allocations,
        pagination: { limit, offset, total: result.total },
      });
    } catch (err) {
      log.error("supplier:allocations:list", asError(err).message);
      return res.status(500).json({ error: "Failed to list allocations" });
    }
  }
);

/**
 * GET /api/v1/supplier/allocations/:id
 * Get allocation detail.
 */
supplierAllocationsRouter.get(
  "/allocations/:id",
  requireSupplierAuth,
  requireActiveSupplier,
  async (req: SupplierAuthRequest, res: Response) => {
    try {
      const supplierId = req.supplier!.id;
      const allocation = await getAllocation(req.params.id);

      if (!allocation || allocation.supplierId !== supplierId) {
        return res.status(404).json({ error: "Allocation not found" });
      }

      return res.json({ success: true, data: allocation });
    } catch (err) {
      log.error("supplier:allocations:get", asError(err).message);
      return res.status(500).json({ error: "Failed to get allocation" });
    }
  }
);

/**
 * PATCH /api/v1/supplier/allocations/:id/status
 * Transition allocation status.
 * Body: { status: "accepted" | "partial_accepted" | "rejected" | "dispatched" | "delivered" }
 */
supplierAllocationsRouter.patch(
  "/allocations/:id/status",
  requireSupplierAuth,
  requireActiveSupplier,
  async (req: SupplierAuthRequest, res: Response) => {
    try {
      const supplierId = req.supplier!.id;
      const { status: newStatus, ...payload } = req.body || {};

      if (!newStatus) {
        return res.status(400).json({ error: "status is required" });
      }

      // Verify supplier owns this allocation
      const allocation = await getAllocation(req.params.id);
      if (!allocation || allocation.supplierId !== supplierId) {
        return res.status(404).json({ error: "Allocation not found" });
      }

      const result = await transitionAllocation(
        req.params.id,
        newStatus as AllocationStatus,
        supplierId,
        payload
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
      log.error("supplier:allocations:transition", msg);
      return res.status(500).json({ error: "Failed to update allocation" });
    }
  }
);
