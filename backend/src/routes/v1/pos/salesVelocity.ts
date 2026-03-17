import { Router } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceToken } from "../../../middleware/deviceToken";
import { asError } from "../../../lib/errorUtils";

// STG-580: Sales velocity calculation for reorder prediction
// GET /pos/stock/velocity — returns avg daily sales per product over last 14 days

export const posSalesVelocityRouter = Router();

posSalesVelocityRouter.get("/stock/velocity", requireDeviceToken, async (req, res) => {
  const pool = getPool();
  const { storeId } = (req as any).posDevice as { storeId: string };

  try {
    const result = await pool.query(
      `SELECT
        si.barcode,
        si.product_name AS name,
        COALESCE(inv.quantity, 0) AS current_stock,
        COALESCE(v.avg_daily_sales, 0) AS avg_daily_sales,
        CASE
          WHEN COALESCE(v.avg_daily_sales, 0) > 0
          THEN FLOOR(COALESCE(inv.quantity, 0) / v.avg_daily_sales)
          ELSE 999
        END AS days_of_stock
      FROM store_products sp
      JOIN LATERAL (
        SELECT barcode, name AS product_name FROM store_products WHERE id = sp.id
      ) si ON true
      LEFT JOIN store_inventory inv ON inv.product_id = sp.id AND inv.store_id = $1
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(sli.quantity), 0) / GREATEST(1, EXTRACT(EPOCH FROM (NOW() - (NOW() - INTERVAL '14 days'))) / 86400) AS avg_daily_sales
        FROM sale_line_items sli
        JOIN sales s ON sli.sale_id = s.id
        WHERE s.store_id = $1 AND sli.barcode = si.barcode AND s.created_at > NOW() - INTERVAL '14 days'
      ) v ON true
      WHERE sp.store_id = $1
      ORDER BY days_of_stock ASC
      LIMIT 50`,
      [storeId]
    );

    res.json({ products: result.rows });
  } catch (err) {
    res.status(500).json({ error: { message: "Failed to calculate sales velocity", detail: asError(err).message } });
  }
});
