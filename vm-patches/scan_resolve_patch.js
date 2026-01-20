// ============================================================
// SCAN RESOLVE - SD-ONBOARD-001B
// ============================================================
app.post("/scan/resolve", validateDeviceToken, async (req, res) => {
  const storeId = req.device.store_id;
  const { barcode } = req.body;

  if (!barcode || typeof barcode !== "string" || barcode.trim().length === 0) {
    return res.status(422).json({
      error: "VALIDATION_ERROR",
      message: "Barcode is required"
    });
  }

  const normalizedBarcode = barcode.trim();

  try {
    // Step 1: Check store_product_barcodes (store-scoped mapping)
    const barcodeResult = await pool.query(`
      SELECT
        sp.id AS store_product_id,
        COALESCE(sp.display_name, p.name) AS name,
        spb.barcode AS barcode,
        sp.sell_price,
        sp.mrp,
        sp.purchase_price,
        COALESCE(sb.current_qty, sp.current_stock, 0) as current_stock,
        p.unit,
        COALESCE(p.brand, '') as brand,
        COALESCE(p.description, '') as description
      FROM catalog.store_product_barcodes spb
      JOIN catalog.store_products sp ON sp.id = spb.store_product_id AND sp.store_id = spb.store_id
      JOIN catalog.products p ON p.id = sp.product_id
      LEFT JOIN inventory.stock_balances sb ON sb.store_id = sp.store_id AND sb.product_id = sp.product_id
      WHERE spb.store_id = $1 AND spb.barcode = $2
      LIMIT 1
    `, [storeId, normalizedBarcode]);

    if (barcodeResult.rows[0]) {
      const row = barcodeResult.rows[0];
      return res.json({
        status: "FOUND",
        storeProduct: {
          storeProductId: row.store_product_id,
          name: row.name || "",
          barcode: row.barcode,
          sellPrice: row.sell_price,
          mrp: row.mrp,
          purchasePrice: row.purchase_price,
          stock: { isKnown: true, qty: row.current_stock || 0 },
          unit: row.unit || "pcs",
          brand: row.brand,
          description: row.description,
          imageUrl: "",
          variant: "",
          packSize: ""
        }
      });
    }

    // Step 2: Fallback - check catalog.products.primary_barcode
    const fallbackResult = await pool.query(`
      SELECT
        sp.id AS store_product_id,
        COALESCE(sp.display_name, p.name) AS name,
        p.primary_barcode AS barcode,
        sp.sell_price,
        sp.mrp,
        sp.purchase_price,
        COALESCE(sb.current_qty, sp.current_stock, 0) as current_stock,
        p.unit,
        COALESCE(p.brand, '') as brand,
        COALESCE(p.description, '') as description
      FROM catalog.products p
      JOIN catalog.store_products sp ON sp.product_id = p.id AND sp.store_id = $1
      LEFT JOIN inventory.stock_balances sb ON sb.store_id = sp.store_id AND sb.product_id = sp.product_id
      WHERE p.primary_barcode = $2
      LIMIT 1
    `, [storeId, normalizedBarcode]);

    if (fallbackResult.rows[0]) {
      const row = fallbackResult.rows[0];
      return res.json({
        status: "FOUND",
        storeProduct: {
          storeProductId: row.store_product_id,
          name: row.name || "",
          barcode: row.barcode,
          sellPrice: row.sell_price,
          mrp: row.mrp,
          purchasePrice: row.purchase_price,
          stock: { isKnown: true, qty: row.current_stock || 0 },
          unit: row.unit || "pcs",
          brand: row.brand,
          description: row.description,
          imageUrl: "",
          variant: "",
          packSize: ""
        }
      });
    }

    // Step 3: Not found - return NEEDS_CREATE
    return res.json({
      status: "NEEDS_CREATE",
      barcode: normalizedBarcode,
      prefill: {
        barcode: normalizedBarcode,
        name: "",
        description: "",
        unit: "pcs",
        imageUrl: "",
        brand: "",
        variant: "",
        packSize: "",
        source: "unknown",
        confidence: "low",
        productId: null
      }
    });
  } catch (err) {
    console.error("[scan/resolve] Error:", err);
    return res.status(503).json({
      error: "SERVICE_UNAVAILABLE",
      message: "Database unavailable"
    });
  }
});

// ============================================================
// CREATE STORE PRODUCT - SD-ONBOARD-001B
// ============================================================
app.post("/store-products", validateDeviceToken, async (req, res) => {
  const storeId = req.device.store_id;
  const { barcode, name, sellPrice, mrp, purchasePrice, initialStockQty, unit, description, brand } = req.body;

  if (!barcode || !name || sellPrice === undefined) {
    return res.status(422).json({
      error: "VALIDATION_ERROR",
      message: "barcode, name, and sellPrice are required"
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check if barcode already mapped for this store
    const existingCheck = await client.query(`
      SELECT sp.id, p.name, sp.sell_price
      FROM catalog.store_product_barcodes spb
      JOIN catalog.store_products sp ON sp.id = spb.store_product_id
      JOIN catalog.products p ON p.id = sp.product_id
      WHERE spb.store_id = $1 AND spb.barcode = $2
    `, [storeId, barcode]);

    if (existingCheck.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "BARCODE_ALREADY_MAPPED",
        message: "Barcode already exists for this store",
        storeProduct: {
          storeProductId: existingCheck.rows[0].id,
          name: existingCheck.rows[0].name,
          barcode: barcode,
          sellPrice: existingCheck.rows[0].sell_price
        }
      });
    }

    // Create product
    const productResult = await client.query(`
      INSERT INTO catalog.products (primary_barcode, name, description, unit, brand)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [barcode, name, description || null, unit || "pcs", brand || null]);
    const productId = productResult.rows[0].id;

    // Create store_product
    const storeProductResult = await client.query(`
      INSERT INTO catalog.store_products (store_id, product_id, sell_price, mrp, purchase_price, current_stock)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [storeId, productId, sellPrice, mrp || null, purchasePrice || null, initialStockQty || 0]);
    const storeProductId = storeProductResult.rows[0].id;

    // Create barcode mapping
    await client.query(`
      INSERT INTO catalog.store_product_barcodes (store_id, store_product_id, barcode, source)
      VALUES ($1, $2, $3, 'manual')
    `, [storeId, storeProductId, barcode]);

    // Create initial stock ledger entry if stock > 0
    if (initialStockQty && initialStockQty > 0) {
      await client.query(`
        INSERT INTO inventory.inventory_ledger (store_id, product_id, delta_qty, transaction_type, stock_before, stock_after, source, notes)
        VALUES ($1, $2, $3, 'inward', 0, $3, 'POS_DIGITISATION', 'Initial stock from POS digitisation')
      `, [storeId, productId, initialStockQty]);

      await client.query(`
        INSERT INTO inventory.stock_balances (store_id, product_id, current_qty)
        VALUES ($1, $2, $3)
        ON CONFLICT (store_id, product_id) DO UPDATE SET current_qty = $3
      `, [storeId, productId, initialStockQty]);
    }

    await client.query("COMMIT");

    return res.status(201).json({
      storeProduct: {
        storeProductId: storeProductId,
        name: name,
        barcode: barcode,
        sellPrice: sellPrice,
        mrp: mrp || null,
        purchasePrice: purchasePrice || null,
        stock: { isKnown: true, qty: initialStockQty || 0 },
        unit: unit || "pcs",
        brand: brand || "",
        description: description || "",
        imageUrl: "",
        variant: "",
        packSize: ""
      }
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[store-products] Error:", err);
    return res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Failed to create product"
    });
  } finally {
    client.release();
  }
});
