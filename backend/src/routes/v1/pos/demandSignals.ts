/**
 * V3-HARDEN-185: POS demand signal endpoints
 * Store-scoped demand snapshots for low-stock cues and reorder prompts.
 */

import { Router, Request, Response } from "express";
import { requireDeviceToken, PosDeviceContext } from "../../../middleware/deviceToken";
import { computeStoreDemandSignals, buildReorderRecommendations } from "../../../services/demandSignalCompute";
import { log } from "../../../lib/logger";
import { asError } from "../../../lib/errorUtils";

export const posDemandSignalsRouter = Router();

function getStoreIdFromDevice(req: Request): string {
  const posDevice = (req as any).posDevice as PosDeviceContext;
  return posDevice.storeId!;
}

/**
 * GET /api/v1/pos/demand-signals
 * Returns demand snapshots for all active SKUs in the device's store.
 * Query params:
 *   - needsReorder=true  → filter to only SKUs needing reorder
 *   - limit=N            → cap results (default 200)
 */
posDemandSignalsRouter.get("/demand-signals", requireDeviceToken, async (req: Request, res: Response) => {
  try {
    const storeId = getStoreIdFromDevice(req);
    const needsReorderOnly = req.query.needsReorder === "true";
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 200, 500);

    const summary = await computeStoreDemandSignals(storeId);

    let signals = summary.signals;
    if (needsReorderOnly) {
      signals = signals.filter((s) => s.needsReorder);
    }
    signals = signals.slice(0, limit);

    return res.json({
      success: true,
      data: {
        storeId: summary.storeId,
        totalProducts: summary.totalProducts,
        needsReorderCount: summary.needsReorderCount,
        criticalCount: summary.criticalCount,
        computedAt: summary.computedAt,
        snapshotVersion: summary.snapshotVersion,
        signals,
      },
    });
  } catch (err) {
    log.error("demand-signals:pos:get", asError(err).message);
    return res.status(500).json({ error: "Failed to compute demand signals" });
  }
});

/**
 * GET /api/v1/pos/demand-signals/recommendations
 * Returns reorder recommendations derived from live demand.
 */
posDemandSignalsRouter.get("/demand-signals/recommendations", requireDeviceToken, async (req: Request, res: Response) => {
  try {
    const storeId = getStoreIdFromDevice(req);
    const summary = await computeStoreDemandSignals(storeId);
    const recommendations = buildReorderRecommendations(summary);

    return res.json({
      success: true,
      data: {
        storeId,
        computedAt: summary.computedAt,
        snapshotVersion: summary.snapshotVersion,
        totalRecommendations: recommendations.length,
        recommendations,
      },
    });
  } catch (err) {
    log.error("demand-signals:pos:recommendations", asError(err).message);
    return res.status(500).json({ error: "Failed to compute recommendations" });
  }
});
