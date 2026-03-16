import { Router } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceToken } from "../../../middleware/deviceToken";
import { requireActiveStore } from "../../../middleware/storeStatusGate";
import { asError } from "../../../lib/errorUtils";

// STG-577: Wholesale fields on supplier product listings
// Adds PTR, PTS, trade_discount, scheme, MOQ, credit_days to catalogue responses

export const posWholesaleRouter = Router();

// GET /pos/catalogue/wholesale/:productId — returns all supplier offers with wholesale metadata
posWholesaleRouter.get("/catalogue/wholesale/:productId", requireDeviceToken, requireActiveStore, async (req, res) => {
  const pool = getPool();
  const storeId = (req as any).deviceStoreId;
  const { productId } = req.params;

  try {
    const result = await pool.query(
      `SELECT
        sp.id,
        sp.supplier_id,
        s.business_name AS supplier_name,
        sp.price_minor AS ptr_minor,
        sp.wholesale_price_minor AS pts_minor,
        sp.mrp_minor,
        sp.trade_discount_pct,
        sp.scheme,
        sp.moq,
        sp.case_size,
        sp.unit,
        sp.credit_days,
        sp.hsn_code,
        sp.gst_pct,
        sp.delivery_days,
        sp.bnpl_available,
        COALESCE(si.quantity, 0) AS current_stock
      FROM supplier_products sp
      JOIN suppliers s ON s.id = sp.supplier_id
      LEFT JOIN store_inventory si ON si.product_id = sp.product_id AND si.store_id = $1
      WHERE sp.product_id = $2 AND sp.is_active = true
      ORDER BY sp.price_minor ASC`,
      [storeId, productId]
    );

    res.json({ offers: result.rows });
  } catch (err) {
    res.status(500).json({ error: { message: "Failed to fetch wholesale offers", detail: asError(err).message } });
  }
});
