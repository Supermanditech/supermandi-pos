// Retailer Admin Suppliers Routes - RCAT-SUP-001, RCAT-SUP-002
// Suppliers CRUD endpoints for retailer dashboard
// Store-scoped via JWT (x-actor-id header from gateway)

import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";

export const retailerAdminSuppliersRouter = Router();

/**
 * Get store ID from gateway-provided headers
 * Gateway sets x-actor-id after JWT verification
 */
function getStoreId(req: Request): string | null {
  const actorId = req.headers['x-actor-id'];
  return typeof actorId === 'string' ? actorId : null;
}

// =============================================================================
// GET /api/v1/retailer-admin/suppliers
// RCAT-SUP-001: List all suppliers linked to the store
// Returns verified, pending, and local (unverified) suppliers
// =============================================================================

retailerAdminSuppliersRouter.get("/suppliers", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Store not identified" } });
  }

  const { query } = req.query;

  try {
    let whereClause = "WHERE ssl.store_id = $1 AND ssl.status = 'active'";
    const params: any[] = [storeId];
    let paramIndex = 2;

    // Server-side search by name/phone/GSTIN
    if (query && typeof query === "string" && query.trim()) {
      const searchTerm = `%${query.trim()}%`;
      whereClause += ` AND (
        s.business_name ILIKE $${paramIndex}
        OR s.trade_name ILIKE $${paramIndex}
        OR s.primary_phone ILIKE $${paramIndex}
        OR s.gstin ILIKE $${paramIndex}
      )`;
      params.push(searchTerm);
      paramIndex++;
    }

    const result = await pool.query(
      `SELECT
        s.id,
        s.business_name as "name",
        s.business_name as "businessName",
        s.trade_name as "tradeName",
        s.business_type as "supplierType",
        s.gstin,
        s.pan,
        s.fssai,
        s.primary_phone as "phone",
        s.whatsapp_enabled as "whatsappEnabled",
        s.secondary_phone as "secondaryPhone",
        s.primary_email as "email",
        s.address_line1 as "addressLine1",
        s.address_line2 as "addressLine2",
        s.area,
        s.city,
        s.state,
        s.pincode,
        COALESCE(s.address_line1, '') || CASE WHEN s.city IS NOT NULL THEN ', ' || s.city ELSE '' END as "address",
        s.verification_status as "verificationStatus",
        CASE WHEN s.verification_status = 'verified' THEN true ELSE false END as "isSupermandi",
        -- Store-link fields (Section C & D)
        ssl.payment_terms as "paymentTerms",
        ssl.credit_days as "creditDays",
        ssl.min_order_value as "minOrderValue",
        ssl.delivery_charges as "deliveryCharges",
        ssl.delivery_schedule as "deliverySchedule",
        ssl.returns_allowed as "returnsAllowed",
        ssl.returns_window as "returnsWindow",
        ssl.tax_invoice_provided as "taxInvoiceProvided",
        ssl.price_source as "priceSource",
        ssl.service_area as "serviceArea",
        ssl.delivery_address as "deliveryAddress",
        ssl.categories_supplied as "categoriesSupplied",
        ssl.brands_supplied as "brandsSupplied",
        ssl.ordering_channel as "orderingChannel",
        ssl.notes
      FROM supplier.suppliers s
      INNER JOIN supplier.supplier_store_links ssl ON ssl.supplier_id = s.id
      ${whereClause}
      ORDER BY
        CASE s.verification_status
          WHEN 'verified' THEN 1
          WHEN 'pending' THEN 2
          ELSE 3
        END,
        s.business_name ASC`,
      params
    );

    return res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error: any) {
    console.error("[RetailerSuppliers] GET error:", error.message);

    // If table doesn't exist, return empty list gracefully
    if (error.code === "42P01") {
      return res.json({
        success: true,
        data: [],
        count: 0,
      });
    }

    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Failed to load suppliers" },
    });
  }
});

// =============================================================================
// POST /api/v1/retailer-admin/suppliers
// RCAT-SUP-002: Create a new local supplier or submit for verification
// Local suppliers get 'unverified' status and are store-editable
// =============================================================================

retailerAdminSuppliersRouter.post("/suppliers", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Store not identified" } });
  }

  const {
    name, supplierType, tradeName, gstin, pan, fssai,
    phone, whatsappEnabled, secondaryPhone, email,
    addressLine1, addressLine2, area, city, state, pincode,
    serviceArea, deliveryAddress,
    paymentTerms, creditDays, minOrderValue, deliveryCharges,
    deliverySchedule, returnsAllowed, returnsWindow, taxInvoiceProvided,
    priceSource, categoriesSupplied, brandsSupplied, orderingChannel, notes,
  } = req.body;

  // Validate required fields
  if (!name || !name.trim()) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Business name is required" } });
  }
  if (!phone || !phone.trim()) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Phone number is required" } });
  }

  // Validate GSTIN format if provided
  if (gstin && gstin.trim()) {
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (!gstinRegex.test(gstin.trim())) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid GSTIN format" } });
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // For local suppliers without GSTIN, generate a unique placeholder
    const effectiveGstin = gstin && gstin.trim()
      ? gstin.trim()
      : `LOCAL-${storeId.substring(0, 8)}-${Date.now()}`;

    // Check if supplier with this GSTIN already exists
    let supplierId: string;
    const existingSupplier = await client.query(
      `SELECT id, verification_status FROM supplier.suppliers WHERE gstin = $1`,
      [effectiveGstin]
    );

    if (existingSupplier.rows.length > 0) {
      // Supplier exists - check if already linked to this store
      supplierId = existingSupplier.rows[0].id;
      const existingLink = await client.query(
        `SELECT id FROM supplier.supplier_store_links WHERE supplier_id = $1 AND store_id = $2`,
        [supplierId, storeId]
      );
      if (existingLink.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: { code: "CONFLICT", message: "Supplier with this GSTIN is already linked to your store" },
        });
      }
    } else {
      // Create new supplier
      const insertResult = await client.query(
        `INSERT INTO supplier.suppliers (
          gstin, business_name, trade_name, business_type, pan, fssai,
          primary_phone, primary_email, whatsapp_enabled, secondary_phone,
          address_line1, address_line2, area, city, state, pincode,
          verification_status, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        RETURNING id`,
        [
          effectiveGstin,
          name.trim(),
          tradeName?.trim() || null,
          supplierType || null,
          pan?.trim() || null,
          fssai?.trim() || null,
          phone.trim(),
          email?.trim() || null,
          whatsappEnabled ?? false,
          secondaryPhone?.trim() || null,
          addressLine1?.trim() || null,
          addressLine2?.trim() || null,
          area?.trim() || null,
          city?.trim() || null,
          state?.trim() || null,
          pincode?.trim() || null,
          'unverified', // Local suppliers are unverified
          'active',
        ]
      );
      supplierId = insertResult.rows[0].id;
    }

    // Create store link with commercial terms
    await client.query(
      `INSERT INTO supplier.supplier_store_links (
        supplier_id, store_id, credit_days, min_order_value,
        payment_terms, delivery_charges, delivery_schedule,
        returns_allowed, returns_window, tax_invoice_provided,
        price_source, service_area, delivery_address,
        categories_supplied, brands_supplied, ordering_channel, notes,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [
        supplierId,
        storeId,
        creditDays || 0,
        minOrderValue || 0,
        paymentTerms || 'Cash',
        deliveryCharges || 0,
        deliverySchedule?.trim() || null,
        returnsAllowed ?? false,
        returnsWindow || 0,
        taxInvoiceProvided ?? false,
        priceSource || null,
        serviceArea?.trim() || null,
        deliveryAddress?.trim() || null,
        JSON.stringify(categoriesSupplied || []),
        brandsSupplied?.trim() || null,
        orderingChannel || null,
        notes?.trim() || null,
        'active',
      ]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      success: true,
      data: { id: supplierId },
      message: "Supplier created successfully",
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("[RetailerSuppliers] POST error:", error.message);

    if (error.code === "23505") { // Unique violation
      return res.status(409).json({
        error: { code: "CONFLICT", message: "A supplier with this GSTIN already exists" },
      });
    }
    if (error.code === "23514") { // Check constraint violation
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Invalid field value: " + error.detail },
      });
    }

    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Failed to create supplier" },
    });
  } finally {
    client.release();
  }
});

// =============================================================================
// PATCH /api/v1/retailer-admin/suppliers/:id
// RCAT-SUP-002: Edit a local (unverified) supplier
// Cannot edit verified or pending suppliers
// =============================================================================

retailerAdminSuppliersRouter.patch("/suppliers/:id", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Store not identified" } });
  }

  const { id } = req.params;
  const {
    name, supplierType, tradeName, pan, fssai,
    phone, whatsappEnabled, secondaryPhone, email,
    addressLine1, addressLine2, area, city, state, pincode,
    serviceArea, deliveryAddress,
    paymentTerms, creditDays, minOrderValue, deliveryCharges,
    deliverySchedule, returnsAllowed, returnsWindow, taxInvoiceProvided,
    priceSource, categoriesSupplied, brandsSupplied, orderingChannel, notes,
  } = req.body;

  const client = await pool.connect();
  try {
    // Verify the supplier is linked to this store and is editable
    const check = await client.query(
      `SELECT s.id, s.verification_status
       FROM supplier.suppliers s
       INNER JOIN supplier.supplier_store_links ssl ON ssl.supplier_id = s.id
       WHERE s.id = $1 AND ssl.store_id = $2 AND ssl.status = 'active'`,
      [id, storeId]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Supplier not found or not linked to your store" },
      });
    }

    if (check.rows[0].verification_status !== 'unverified') {
      return res.status(403).json({
        error: { code: "CANNOT_EDIT_SUPERMANDI", message: "Cannot edit verified or pending suppliers" },
      });
    }

    await client.query("BEGIN");

    // Update supplier entity fields
    const warnings: string[] = [];
    await client.query(
      `UPDATE supplier.suppliers SET
        business_name = COALESCE($2, business_name),
        trade_name = $3,
        business_type = $4,
        pan = $5,
        fssai = $6,
        primary_phone = COALESCE($7, primary_phone),
        primary_email = $8,
        whatsapp_enabled = COALESCE($9, whatsapp_enabled),
        secondary_phone = $10,
        address_line1 = $11,
        address_line2 = $12,
        area = $13,
        city = $14,
        state = $15,
        pincode = $16,
        updated_at = NOW()
      WHERE id = $1`,
      [
        id,
        name?.trim() || null,
        tradeName?.trim() || null,
        supplierType || null,
        pan?.trim() || null,
        fssai?.trim() || null,
        phone?.trim() || null,
        email?.trim() || null,
        whatsappEnabled ?? null,
        secondaryPhone?.trim() || null,
        addressLine1?.trim() || null,
        addressLine2?.trim() || null,
        area?.trim() || null,
        city?.trim() || null,
        state?.trim() || null,
        pincode?.trim() || null,
      ]
    );

    // Update store link commercial terms
    await client.query(
      `UPDATE supplier.supplier_store_links SET
        payment_terms = COALESCE($3, payment_terms),
        credit_days = COALESCE($4, credit_days),
        min_order_value = COALESCE($5, min_order_value),
        delivery_charges = COALESCE($6, delivery_charges),
        delivery_schedule = $7,
        returns_allowed = COALESCE($8, returns_allowed),
        returns_window = COALESCE($9, returns_window),
        tax_invoice_provided = COALESCE($10, tax_invoice_provided),
        price_source = $11,
        service_area = $12,
        delivery_address = $13,
        categories_supplied = COALESCE($14, categories_supplied),
        brands_supplied = $15,
        ordering_channel = $16,
        notes = $17,
        updated_at = NOW()
      WHERE supplier_id = $1 AND store_id = $2`,
      [
        id,
        storeId,
        paymentTerms || null,
        creditDays !== undefined ? creditDays : null,
        minOrderValue !== undefined ? minOrderValue : null,
        deliveryCharges !== undefined ? deliveryCharges : null,
        deliverySchedule?.trim() || null,
        returnsAllowed !== undefined ? returnsAllowed : null,
        returnsWindow !== undefined ? returnsWindow : null,
        taxInvoiceProvided !== undefined ? taxInvoiceProvided : null,
        priceSource || null,
        serviceArea?.trim() || null,
        deliveryAddress?.trim() || null,
        categoriesSupplied ? JSON.stringify(categoriesSupplied) : null,
        brandsSupplied?.trim() || null,
        orderingChannel || null,
        notes?.trim() || null,
      ]
    );

    await client.query("COMMIT");

    return res.json({
      success: true,
      data: { id },
      message: "Supplier updated successfully",
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("[RetailerSuppliers] PATCH error:", error.message);

    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Failed to update supplier" },
    });
  } finally {
    client.release();
  }
});

// =============================================================================
// DELETE /api/v1/retailer-admin/suppliers/:id
// RCAT-SUP-002: Remove a supplier link from store (soft delete)
// =============================================================================

// =============================================================================
// GET /api/v1/retailer-admin/supplier-catalog
// CA-1.4-001/002: View approved products from verified suppliers
// Returns products that are approved and available for the store to order
// =============================================================================

retailerAdminSuppliersRouter.get("/supplier-catalog", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Store not identified" } });
  }

  const { query, category, supplierId, limit = "50", offset = "0" } = req.query;

  try {
    // Get store location for service area matching
    const storeResult = await pool.query(
      `SELECT pincode, city, state FROM platform.stores WHERE id = $1`,
      [storeId]
    );
    const storePincode = storeResult.rows[0]?.pincode || null;
    const storeCity = storeResult.rows[0]?.city || null;
    const storeState = storeResult.rows[0]?.state || null;

    let whereClause = `WHERE sp.approval_status = 'approved' AND s.verification_status = 'verified' AND s.status = 'active'`;
    const params: any[] = [];
    let paramIndex = 1;

    // Filter by supplier if specified
    if (supplierId && typeof supplierId === "string") {
      whereClause += ` AND sp.supplier_id = $${paramIndex}::uuid`;
      params.push(supplierId);
      paramIndex++;
    }

    // Search by product name or barcode
    if (query && typeof query === "string" && query.trim()) {
      const searchTerm = `%${query.trim()}%`;
      whereClause += ` AND (sp.name ILIKE $${paramIndex} OR sp.barcode ILIKE $${paramIndex})`;
      params.push(searchTerm);
      paramIndex++;
    }

    // Filter by category
    if (category && typeof category === "string" && category.trim()) {
      whereClause += ` AND sp.category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    const limitNum = Math.min(parseInt(limit as string, 10) || 50, 200);
    const offsetNum = Math.max(parseInt(offset as string, 10) || 0, 0);

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total
       FROM catalog.supplier_products sp
       JOIN supplier.suppliers s ON s.id = sp.supplier_id
       ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total || "0", 10);

    // Get products with supplier info
    const result = await pool.query(
      `SELECT
        sp.id as "productId",
        sp.name as "productName",
        COALESCE(sp.edited_name, sp.name) as "displayName",
        sp.barcode,
        sp.category,
        sp.unit,
        sp.purchase_price as "supplierPriceMinor",
        sp.supermandi_margin_minor as "marginMinor",
        (sp.purchase_price + COALESCE(sp.supermandi_margin_minor, 0)) as "retailerPriceMinor",
        sp.mrp as "mrpMinor",
        sp.bnpl_eligible as "bnplEligible",
        sp.bnpl_max_days as "bnplMaxDays",
        NULL as "imageUrl",
        sp.approved_at as "approvedAt",
        s.id as "supplierId",
        s.business_name as "supplierName",
        s.trade_name as "supplierTradeName",
        s.city as "supplierCity",
        s.primary_phone as "supplierPhone"
      FROM catalog.supplier_products sp
      JOIN supplier.suppliers s ON s.id = sp.supplier_id
      ${whereClause}
      ORDER BY sp.approved_at DESC, sp.name ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limitNum, offsetNum]
    );

    // CA-1.4-001: Mark products already in store catalog
    const productIds = result.rows.map(r => r.productId);
    const existingResult = productIds.length > 0 ? await pool.query(
      `SELECT DISTINCT sp.product_id
       FROM catalog.store_products sp
       WHERE sp.store_id = $1 AND sp.product_id = ANY($2::uuid[])`,
      [storeId, productIds]
    ) : { rows: [] };
    const existingProductIds = new Set(existingResult.rows.map(r => String(r.product_id)));

    const products = result.rows.map(row => ({
      ...row,
      supplierPriceMinor: Number(row.supplierPriceMinor) || 0,
      marginMinor: Number(row.marginMinor) || 0,
      retailerPriceMinor: Number(row.retailerPriceMinor) || 0,
      mrpMinor: Number(row.mrpMinor) || 0,
      bnplEligible: row.bnplEligible === true,
      bnplMaxDays: Number(row.bnplMaxDays) || 0,
      inStoreCatalog: existingProductIds.has(row.productId),
    }));

    return res.json({
      success: true,
      data: products,
      pagination: {
        total,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + result.rows.length < total,
      },
    });
  } catch (error: any) {
    console.error("[RetailerSupplierCatalog] GET error:", error.message);

    // If table doesn't exist, return empty list
    if (error.code === "42P01") {
      return res.json({
        success: true,
        data: [],
        pagination: { total: 0, limit: 50, offset: 0, hasMore: false },
      });
    }

    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Failed to load supplier catalog" },
    });
  }
});

// =============================================================================
// POST /api/v1/retailer-admin/supplier-catalog/:productId/add
// CA-1.4-001: Add a supplier product to the store's catalog
// =============================================================================

retailerAdminSuppliersRouter.post("/supplier-catalog/:productId/add", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Store not identified" } });
  }

  const { productId } = req.params;
  const { initialStock = 0, sellPrice } = req.body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verify product is approved and from a verified supplier
    const productCheck = await client.query(
      `SELECT sp.id, sp.name, sp.barcode, sp.category, sp.purchase_price,
              sp.supermandi_margin_minor, sp.mrp, sp.unit,
              s.id as supplier_id, s.business_name
       FROM catalog.supplier_products sp
       JOIN supplier.suppliers s ON s.id = sp.supplier_id
       WHERE sp.id = $1::uuid
         AND sp.approval_status = 'approved'
         AND s.verification_status = 'verified'`,
      [productId]
    );

    if (productCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Product not found or not approved" },
      });
    }

    const product = productCheck.rows[0];
    const retailerPrice = sellPrice ||
      (product.purchase_price + (product.supermandi_margin_minor || 0));

    // Check if already in store catalog
    const existingCheck = await client.query(
      `SELECT id FROM catalog.store_products WHERE store_id = $1 AND product_id = $2::uuid`,
      [storeId, productId]
    );

    if (existingCheck.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: { code: "CONFLICT", message: "Product already in your catalog" },
      });
    }

    // First ensure the product exists in catalog.products (master catalog)
    // Handle both id and barcode conflicts gracefully
    await client.query(
      `INSERT INTO catalog.products (id, name, primary_barcode, category, unit)
       VALUES ($1::uuid, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [productId, product.name, product.barcode, product.category, product.unit]
    );

    // Add to store catalog
    const insertResult = await client.query(
      `INSERT INTO catalog.store_products (
        store_id, product_id, display_name, sell_price, purchase_price,
        current_stock, is_active, supplier_id
      ) VALUES ($1, $2::uuid, $3, $4, $5, $6, true, $7::uuid)
      RETURNING id`,
      [
        storeId,
        productId,
        product.name,
        retailerPrice,
        product.purchase_price,
        initialStock || 0,
        product.supplier_id
      ]
    );

    // Add barcode if exists
    if (product.barcode) {
      await client.query(
        `INSERT INTO catalog.store_product_barcodes (store_id, store_product_id, barcode, source)
         VALUES ($1, $2, $3, 'supplier_sync')
         ON CONFLICT (store_id, barcode) DO NOTHING`,
        [storeId, insertResult.rows[0].id, product.barcode]
      );
    }

    // Initialize stock balance
    if (initialStock > 0) {
      await client.query(
        `INSERT INTO inventory.stock_balances (store_id, product_id, current_qty, updated_at)
         VALUES ($1, $2::uuid, $3, NOW())
         ON CONFLICT (store_id, product_id) DO UPDATE SET
           current_qty = $3,
           updated_at = NOW()`,
        [storeId, productId, initialStock]
      );
    }

    await client.query("COMMIT");

    return res.status(201).json({
      success: true,
      data: {
        storeProductId: insertResult.rows[0].id,
        productId,
        productName: product.name,
        supplierName: product.business_name,
      },
      message: "Product added to your catalog",
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("[RetailerSupplierCatalog] POST add error:", error.message);

    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Failed to add product to catalog" },
    });
  } finally {
    client.release();
  }
});

retailerAdminSuppliersRouter.delete("/suppliers/:id", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Store not identified" } });
  }

  const { id } = req.params;

  try {
    // Soft-delete: set status to 'inactive' on the store link
    const result = await pool.query(
      `UPDATE supplier.supplier_store_links
       SET status = 'inactive', updated_at = NOW()
       WHERE supplier_id = $1 AND store_id = $2 AND status = 'active'
       RETURNING id`,
      [id, storeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Supplier not found or already removed" },
      });
    }

    return res.json({
      success: true,
      message: "Supplier removed from store",
    });
  } catch (error: any) {
    console.error("[RetailerSuppliers] DELETE error:", error.message);

    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Failed to remove supplier" },
    });
  }
});
