/**
 * SA-P0-003: Admin Price Bounds Route
 *
 * GET  /api/v1/admin/price-bounds  — return current global price bounds
 * PATCH /api/v1/admin/price-bounds — update bounds (admin auth required)
 */
import { Router } from "express";
import { requireAdminToken } from "../../../middleware/adminToken";
import { getPool } from "../../../db/client";
import { log } from "../../../lib/logger";
import { invalidatePriceBoundsCache } from "../../../utils/priceBoundsValidator";

export const adminPriceBoundsRouter = Router();

adminPriceBoundsRouter.use(requireAdminToken);

// GET /api/v1/admin/price-bounds
adminPriceBoundsRouter.get("/price-bounds", async (_req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    const result = await pool.query(
      "SELECT min_price_paise, max_price_paise, updated_at, updated_by FROM platform.price_bounds ORDER BY id LIMIT 1"
    );

    if (result.rows.length === 0) {
      return res.json({
        priceBounds: {
          minPricePaise: 100,
          maxPricePaise: 10000000,
          updatedAt: null,
          updatedBy: null,
        },
      });
    }

    const row = result.rows[0];
    return res.json({
      priceBounds: {
        minPricePaise: parseInt(row.min_price_paise, 10),
        maxPricePaise: parseInt(row.max_price_paise, 10),
        updatedAt: row.updated_at,
        updatedBy: row.updated_by,
      },
    });
  } catch (error: unknown) {
    log.error("[admin/price-bounds] Failed to fetch:", error);
    return res.status(500).json({ error: "fetch_price_bounds_failed" });
  }
});

// PATCH /api/v1/admin/price-bounds
adminPriceBoundsRouter.patch("/price-bounds", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { minPricePaise, maxPricePaise } = req.body ?? {};

  // Validate inputs
  if (minPricePaise === undefined && maxPricePaise === undefined) {
    return res.status(400).json({ error: "At least one of minPricePaise or maxPricePaise is required" });
  }

  if (minPricePaise !== undefined) {
    if (typeof minPricePaise !== "number" || !Number.isInteger(minPricePaise) || minPricePaise <= 0) {
      return res.status(400).json({ error: "minPricePaise must be a positive integer" });
    }
  }

  if (maxPricePaise !== undefined) {
    if (typeof maxPricePaise !== "number" || !Number.isInteger(maxPricePaise) || maxPricePaise <= 0) {
      return res.status(400).json({ error: "maxPricePaise must be a positive integer" });
    }
  }

  try {
    // Fetch current bounds to merge partial updates
    const current = await pool.query(
      "SELECT min_price_paise, max_price_paise FROM platform.price_bounds ORDER BY id LIMIT 1"
    );

    const currentMin = current.rows.length > 0 ? parseInt(current.rows[0].min_price_paise, 10) : 100;
    const currentMax = current.rows.length > 0 ? parseInt(current.rows[0].max_price_paise, 10) : 10000000;

    const newMin = minPricePaise ?? currentMin;
    const newMax = maxPricePaise ?? currentMax;

    // Validate: max must be greater than min
    if (newMax <= newMin) {
      return res.status(400).json({ error: "maxPricePaise must be greater than minPricePaise" });
    }

    // Extract admin identity from the token (set by requireAdminToken middleware)
    const updatedBy = (req as any).adminId || (req as any).admin?.id || "admin";

    if (current.rows.length === 0) {
      // Insert if no row exists
      await pool.query(
        "INSERT INTO platform.price_bounds (min_price_paise, max_price_paise, updated_by) VALUES ($1, $2, $3)",
        [newMin, newMax, updatedBy]
      );
    } else {
      // Update existing row
      await pool.query(
        `UPDATE platform.price_bounds SET
          min_price_paise = $1,
          max_price_paise = $2,
          updated_by = $3
        WHERE id = (SELECT id FROM platform.price_bounds ORDER BY id LIMIT 1)`,
        [newMin, newMax, updatedBy]
      );
    }

    // Invalidate cache so next validation uses new bounds
    invalidatePriceBoundsCache();

    log.info(`[admin/price-bounds] Updated bounds: min=${newMin}, max=${newMax} by ${updatedBy}`);

    return res.json({
      priceBounds: {
        minPricePaise: newMin,
        maxPricePaise: newMax,
        updatedBy,
      },
    });
  } catch (error: unknown) {
    log.error("[admin/price-bounds] Failed to update:", error);
    return res.status(500).json({ error: "update_price_bounds_failed" });
  }
});
