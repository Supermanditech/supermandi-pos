import { Router } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceToken } from "../../../middleware/deviceToken";
import { asError } from "../../../lib/errorUtils";

// STG-579: Master product catalog lookup for new product auto-fill
// GET /pos/catalog/master/:barcode — looks up barcode in shared product database

export const posMasterCatalogRouter = Router();

posMasterCatalogRouter.get("/catalog/master/:barcode", requireDeviceToken, async (req, res) => {
  const pool = getPool();
  const { barcode } = req.params;

  try {
    // Look up in global products table (shared across all stores)
    const result = await pool.query(
      `SELECT
        p.id,
        p.name,
        p.brand,
        p.category,
        p.sub_category,
        p.pack_size,
        p.unit,
        p.mrp_minor,
        p.hsn_code,
        p.gst_pct,
        p.barcode,
        p.image_url,
        p.description
      FROM products p
      WHERE p.barcode = $1 AND p.is_active = true
      LIMIT 1`,
      [barcode]
    );

    if (result.rows.length === 0) {
      res.json({ found: false, barcode });
      return;
    }

    res.json({ found: true, product: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: { message: "Failed to lookup master catalog", detail: asError(err).message } });
  }
});
