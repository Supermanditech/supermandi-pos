/**
 * V3-FIX-186: POS buy-again / repeat-last-order endpoint
 *
 * POST /api/v1/pos/buy-again
 *   Body: { orderId?: string, productIds?: string[] }
 *   - orderId: repeat a specific previous purchase order
 *   - productIds: build draft from specific products using last purchase + demand
 *   - neither: returns last 10 purchased products as suggestions
 *
 * Returns a BuyAgainDraft ready to load into purchaseDraftStore.
 */

import { Router, Request, Response } from "express";
import { requireDeviceToken, PosDeviceContext } from "../../../middleware/deviceToken";
import { buildBuyAgainFromOrder, buildBuyAgainFromProducts } from "../../../services/buyAgainService";
import { getPool } from "../../../db/client";
import { log } from "../../../lib/logger";
import { asError } from "../../../lib/errorUtils";

export const posBuyAgainRouter = Router();

function getStoreIdFromDevice(req: Request): string {
  const posDevice = (req as any).posDevice as PosDeviceContext;
  return posDevice.storeId!;
}

/**
 * POST /api/v1/pos/buy-again
 */
posBuyAgainRouter.post("/buy-again", requireDeviceToken, async (req: Request, res: Response) => {
  try {
    const storeId = getStoreIdFromDevice(req);
    const { orderId, productIds } = req.body || {};

    if (orderId && typeof orderId === "string") {
      const draft = await buildBuyAgainFromOrder(storeId, orderId);
      return res.json({ success: true, data: draft });
    }

    if (Array.isArray(productIds) && productIds.length > 0) {
      const sanitized = productIds.filter((id: unknown) => typeof id === "string").slice(0, 50);
      const draft = await buildBuyAgainFromProducts(storeId, sanitized);
      return res.json({ success: true, data: draft });
    }

    // Default: return last 10 distinct purchased products as suggestions
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "Database unavailable" });

    const result = await pool.query<{ product_id: string }>(
      `SELECT DISTINCT ON (pi.product_id) pi.product_id
       FROM purchase_items pi
       JOIN purchases p ON pi.purchase_id = p.id
       WHERE p.store_id = $1
       ORDER BY pi.product_id, p.created_at DESC
       LIMIT 10`,
      [storeId]
    );

    const pids = result.rows.map((r) => r.product_id);
    const draft = await buildBuyAgainFromProducts(storeId, pids);
    return res.json({ success: true, data: draft });
  } catch (err) {
    log.error("buy-again:pos", asError(err).message);
    return res.status(500).json({ error: "Failed to build buy-again draft" });
  }
});

/**
 * GET /api/v1/pos/buy-again/history
 * Returns recent purchase orders for "repeat last order" selection.
 */
posBuyAgainRouter.get("/buy-again/history", requireDeviceToken, async (req: Request, res: Response) => {
  try {
    const storeId = getStoreIdFromDevice(req);
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 10, 20);
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "Database unavailable" });

    const result = await pool.query(
      `SELECT
        p.id,
        p.supplier_name,
        p.total_minor,
        p.created_at,
        COUNT(pi.id)::int AS item_count
      FROM purchases p
      LEFT JOIN purchase_items pi ON pi.purchase_id = p.id
      WHERE p.store_id = $1
      GROUP BY p.id, p.supplier_name, p.total_minor, p.created_at
      ORDER BY p.created_at DESC
      LIMIT $2`,
      [storeId, limit]
    );

    return res.json({
      success: true,
      data: result.rows.map((r: any) => ({
        orderId: r.id,
        supplierName: r.supplier_name,
        totalMinor: r.total_minor,
        itemCount: r.item_count,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    log.error("buy-again:history", asError(err).message);
    return res.status(500).json({ error: "Failed to load purchase history" });
  }
});
