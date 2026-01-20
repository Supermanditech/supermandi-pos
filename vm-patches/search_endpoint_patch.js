// ============================================================
// STORE PRODUCTS SEARCH - For POS text search
// ============================================================
app.get("/store-products/search", validateDeviceToken, async (req, res) => {
  const storeId = req.device.store_id;
  const { q, limit = "50", includeZeroStock = "true" } = req.query;

  if (!q || typeof q !== "string" || q.trim().length === 0) {
    return res.json({ success: true, data: [] });
  }

  const searchTerm = q.trim();
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const includeZero = includeZeroStock === "true";

  try {
    // Search by name or barcode (case-insensitive)
    let query = `
      SELECT
        sp.id AS store_product_id,
        COALESCE(sp.display_name, p.name) AS name,
        COALESCE(spb.barcode, p.primary_barcode) AS barcode,
        sp.sell_price,
        sp.mrp,
        COALESCE(sb.current_qty, sp.current_stock, 0) as stock,
        p.unit
      FROM catalog.store_products sp
      JOIN catalog.products p ON p.id = sp.product_id
      LEFT JOIN catalog.store_product_barcodes spb ON spb.store_product_id = sp.id AND spb.store_id = sp.store_id
      LEFT JOIN inventory.stock_balances sb ON sb.store_id = sp.store_id AND sb.product_id = sp.product_id
      WHERE sp.store_id = $1
        AND (
          p.name ILIKE $2
          OR p.primary_barcode ILIKE $2
          OR spb.barcode ILIKE $2
        )
    `;

    const params = [storeId, `%${searchTerm}%`];

    if (!includeZero) {
      query += ` AND COALESCE(sb.current_qty, sp.current_stock, 0) > 0`;
    }

    query += ` ORDER BY p.name ASC LIMIT $3`;
    params.push(limitNum);

    const result = await pool.query(query, params);

    const products = result.rows.map(row => ({
      storeProductId: row.store_product_id,
      name: row.name || "",
      barcode: row.barcode || "",
      sellPrice: row.sell_price,
      mrp: row.mrp,
      stock: { isKnown: true, qty: row.stock || 0 },
      unit: row.unit || "pcs"
    }));

    return res.json({
      success: true,
      data: products
    });
  } catch (err) {
    console.error("[store-products/search] Error:", err);
    return res.status(503).json({
      error: "SERVICE_UNAVAILABLE",
      message: "Database unavailable"
    });
  }
});
