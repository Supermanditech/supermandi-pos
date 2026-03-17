import { Router } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceToken } from "../../../middleware/deviceToken";
import { asError } from "../../../lib/errorUtils";

// STG-578: Last purchase lookup for repeat purchase auto-fill
// GET /pos/purchase/last/:barcode?supplierId=X — returns most recent purchase record

export const posLastPurchaseRouter = Router();

posLastPurchaseRouter.get("/purchase/last/:barcode", requireDeviceToken, async (req, res) => {
  const pool = getPool();
  const { storeId } = (req as any).posDevice as { storeId: string };
  const { barcode } = req.params;
  const supplierId = req.query.supplierId as string | undefined;

  try {
    const query = `
      SELECT
        pi.barcode,
        pi.product_name,
        pi.quantity,
        pi.unit_cost_minor AS purchase_price_minor,
        pi.selling_price_minor,
        p.supplier_name,
        p.created_at AS purchase_date,
        p.id AS purchase_id
      FROM purchase_items pi
      JOIN purchases p ON pi.purchase_id = p.id
      WHERE p.store_id = $1 AND pi.barcode = $2
      ${supplierId ? "AND p.supplier_id = $3" : ""}
      ORDER BY p.created_at DESC
      LIMIT 1
    `;
    const params = supplierId ? [storeId, barcode, supplierId] : [storeId, barcode];
    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      res.json({ found: false });
      return;
    }

    res.json({ found: true, lastPurchase: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: { message: "Failed to lookup last purchase", detail: asError(err).message } });
  }
});
