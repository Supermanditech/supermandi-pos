/**
 * V3-HARDEN-185: Retailer-admin demand signal endpoints
 * Store-scoped demand dashboard for retailer web portal.
 */

import { Router, Request, Response } from "express";
import { computeStoreDemandSignals, buildReorderRecommendations } from "../../../services/demandSignalCompute";
import { log } from "../../../lib/logger";
import { asError } from "../../../lib/errorUtils";

export const retailerDemandSignalsRouter = Router();

/**
 * GET /api/v1/retailer-admin/demand-signals
 * Returns demand signals for the retailer's store.
 * Store ID derived from validated gateway headers (requireStoreOwnership middleware).
 *
 * Query params:
 *   - needsReorder=true → filter to SKUs needing reorder
 *   - sortBy=daysOfStock|velocity|stock (default: daysOfStock)
 *   - limit=N (default: 100, max: 500)
 */
retailerDemandSignalsRouter.get("/demand-signals", async (req: Request, res: Response) => {
  try {
    const storeId = (req as any).storeId as string;
    if (!storeId) return res.status(401).json({ error: "Store context required" });

    const needsReorderOnly = req.query.needsReorder === "true";
    const sortBy = (req.query.sortBy as string) || "daysOfStock";
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 100, 500);

    const summary = await computeStoreDemandSignals(storeId);

    let signals = summary.signals;
    if (needsReorderOnly) {
      signals = signals.filter((s) => s.needsReorder);
    }

    // Sort
    if (sortBy === "velocity") {
      signals.sort((a, b) => b.dailyVelocity - a.dailyVelocity);
    } else if (sortBy === "stock") {
      signals.sort((a, b) => a.currentStock - b.currentStock);
    }
    // default: daysOfStock (already sorted by velocity from compute, re-sort)
    if (sortBy === "daysOfStock") {
      signals.sort((a, b) => a.daysOfStock - b.daysOfStock);
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
    log.error("demand-signals:retailer:get", asError(err).message);
    return res.status(500).json({ error: "Failed to compute demand signals" });
  }
});

/**
 * GET /api/v1/retailer-admin/demand-signals/recommendations
 * Returns buy-again / reorder recommendations.
 */
retailerDemandSignalsRouter.get("/demand-signals/recommendations", async (req: Request, res: Response) => {
  try {
    const storeId = (req as any).storeId as string;
    if (!storeId) return res.status(401).json({ error: "Store context required" });

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
    log.error("demand-signals:retailer:recommendations", asError(err).message);
    return res.status(500).json({ error: "Failed to compute recommendations" });
  }
});
