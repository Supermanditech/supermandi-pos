/**
 * V3-HARDEN-185: SuperAdmin demand signal endpoints
 * Cross-store demand pressure dashboard + per-store drill-down.
 */

import { Router, Request, Response } from "express";
import {
  computeStoreDemandSignals,
  computeCrossStoreDemandPressure,
} from "../../../services/demandSignalCompute";
import { log } from "../../../lib/logger";
import { asError } from "../../../lib/errorUtils";

export const adminDemandSignalsRouter = Router();

/**
 * GET /api/v1/admin/demand-signals/pressure
 * Cross-store demand pressure: which products are low across many stores?
 * Query: limit=N (default 50)
 */
adminDemandSignalsRouter.get("/demand-signals/pressure", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);
    const pressure = await computeCrossStoreDemandPressure({ limit });

    return res.json({
      success: true,
      data: {
        computedAt: new Date().toISOString(),
        totalProducts: pressure.length,
        pressure,
      },
    });
  } catch (err) {
    log.error("demand-signals:admin:pressure", asError(err).message);
    return res.status(500).json({ error: "Failed to compute cross-store demand" });
  }
});

/**
 * GET /api/v1/admin/demand-signals/store/:storeId
 * Per-store demand drill-down for superadmin investigation.
 */
adminDemandSignalsRouter.get("/demand-signals/store/:storeId", async (req: Request, res: Response) => {
  try {
    const { storeId } = req.params;
    if (!storeId) return res.status(400).json({ error: "storeId required" });

    const summary = await computeStoreDemandSignals(storeId);

    return res.json({
      success: true,
      data: {
        storeId: summary.storeId,
        totalProducts: summary.totalProducts,
        needsReorderCount: summary.needsReorderCount,
        criticalCount: summary.criticalCount,
        computedAt: summary.computedAt,
        snapshotVersion: summary.snapshotVersion,
        signals: summary.signals.slice(0, 200),
      },
    });
  } catch (err) {
    log.error("demand-signals:admin:store", asError(err).message);
    return res.status(500).json({ error: "Failed to compute store demand" });
  }
});

/**
 * POST /api/v1/admin/demand-signals/recompute
 * On-demand recompute trigger (admin-only). Idempotent.
 * Body: { storeId: string } (optional — if omitted, returns cross-store pressure)
 */
adminDemandSignalsRouter.post("/demand-signals/recompute", async (req: Request, res: Response) => {
  try {
    const { storeId } = req.body || {};

    if (storeId) {
      const summary = await computeStoreDemandSignals(storeId);
      return res.json({
        success: true,
        data: {
          storeId: summary.storeId,
          totalProducts: summary.totalProducts,
          needsReorderCount: summary.needsReorderCount,
          criticalCount: summary.criticalCount,
          computedAt: summary.computedAt,
          snapshotVersion: summary.snapshotVersion,
        },
      });
    }

    const pressure = await computeCrossStoreDemandPressure();
    return res.json({
      success: true,
      data: {
        computedAt: new Date().toISOString(),
        totalProducts: pressure.length,
        pressure,
      },
    });
  } catch (err) {
    log.error("demand-signals:admin:recompute", asError(err).message);
    return res.status(500).json({ error: "Failed to recompute demand signals" });
  }
});
