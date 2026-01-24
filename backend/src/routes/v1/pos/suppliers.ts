// POS Suppliers Routes - 10K Store Scale compliant
// Only returns verified suppliers (isSupermandi=true) for POS sync
// Unverified/local suppliers are NOT visible on POS per spec

import { Router } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceToken } from "../../../middleware/deviceToken";

export const posSuppliersRouter = Router();

interface PosSupplier {
  id: string;
  supplierCode: string;
  businessName: string;
  tradeName: string | null;
  gstin: string | null; // Can be null for farmers/informal suppliers
  primaryPhone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  // Store-specific terms from supplier_store_links
  creditDays: number;
  minOrderValue: number;
  expectedDeliveryDays: number;
  isPreferred: boolean;
  // 10K Store Scale verification contract (CRITICAL)
  // These fields PROVE the supplier passed the gate checks
  supplierVerified: true; // Always true for POS (verified-only filter)
  supplierAccountId: string; // NOT NULL - proves supplier has platform account
  verificationSource: 'platform';
  // Explicit verification flags for downstream validation
  supplierAppRegistered: true; // Has platform account (id exists)
  superAdminVerified: true; // verification_status = 'verified'
  hasRealGstin: boolean; // Computed: gstin IS NOT NULL AND NOT LIKE 'XX%'
}

/**
 * GET /api/v1/pos/suppliers
 * Get all VERIFIED suppliers linked to the store.
 *
 * 10K STORE SCALE GATE (CRITICAL - enforced in query):
 * 1. s.id IS NOT NULL (supplier has platform account)
 * 2. s.verification_status = 'verified' (SuperAdmin verified)
 * 3. ssl.store_id = $1 (store-scoped mapping)
 * 4. ssl.status = 'active' (active link)
 *
 * NOTE: GSTIN is NOT required for verification - suppliers can be
 * verified without GSTIN (e.g., farmers, local vendors).
 * hasRealGstin is computed and returned for informational purposes.
 *
 * This enforces the 10K Store Scale rule that only verified
 * suppliers (isSupermandi=true) are visible on POS.
 */
posSuppliersRouter.get("/suppliers", requireDeviceToken, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as any).posDevice as { storeId: string };

  try {
    // Only fetch verified suppliers
    const result = await pool.query<{
      id: string;
      business_name: string;
      trade_name: string | null;
      gstin: string | null;
      primary_phone: string | null;
      primary_email: string | null;
      city: string | null;
      state: string | null;
      credit_days: number;
      min_order_value: number;
      expected_delivery_days: number;
      is_preferred: boolean;
      has_real_gstin: boolean;
    }>(
      `SELECT
         s.id,
         s.business_name,
         s.trade_name,
         s.gstin,
         s.primary_phone,
         s.primary_email,
         s.city,
         s.state,
         COALESCE(ssl.credit_days, 0) as credit_days,
         COALESCE(ssl.min_order_value, 0) as min_order_value,
         COALESCE(ssl.expected_delivery_days, 2) as expected_delivery_days,
         COALESCE(ssl.is_preferred, false) as is_preferred,
         -- Computed: has real GSTIN (not NULL, not placeholder)
         (s.gstin IS NOT NULL AND s.gstin NOT LIKE 'XX%') as has_real_gstin
       FROM supplier.suppliers s
       JOIN supplier.supplier_store_links ssl ON s.id = ssl.supplier_id
       WHERE ssl.store_id = $1
         -- 10K STORE SCALE GATE:
         -- 1. supplier has platform account (enforced by JOIN)
         AND s.id IS NOT NULL
         -- 2. superAdminVerified = true (THIS IS THE KEY GATE)
         AND s.verification_status = 'verified'
         -- 3. store-scoped mapping (ssl.store_id = $1)
         -- 4. active link
         AND ssl.status = 'active'
       ORDER BY
         ssl.is_preferred DESC,
         ssl.priority ASC,
         s.business_name ASC`,
      [storeId]
    );

    const suppliers: PosSupplier[] = result.rows.map(row => ({
      id: row.id,
      supplierCode: row.id.substring(0, 8).toUpperCase(), // Short code from UUID
      businessName: row.business_name,
      tradeName: row.trade_name,
      gstin: row.gstin,
      primaryPhone: row.primary_phone,
      email: row.primary_email,
      city: row.city,
      state: row.state,
      creditDays: row.credit_days,
      minOrderValue: row.min_order_value,
      expectedDeliveryDays: row.expected_delivery_days,
      isPreferred: row.is_preferred,
      // 10K Store Scale verification contract (CRITICAL)
      // These prove the query enforced all gate checks
      supplierVerified: true,
      supplierAccountId: row.id, // NOT NULL by query filter + UUID PK constraint
      verificationSource: 'platform',
      // Explicit verification flags for downstream validation
      supplierAppRegistered: true, // Has id = has platform account
      superAdminVerified: true, // Query filters verification_status = 'verified'
      hasRealGstin: row.has_real_gstin, // Computed from query
    }));

    return res.json({
      success: true,
      data: {
        suppliers,
      },
      count: suppliers.length,
    });
  } catch (error) {
    console.error("[pos/suppliers] Error fetching suppliers:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch suppliers",
    });
  }
});

/**
 * GET /api/v1/pos/suppliers/:supplierId
 * Get a single verified supplier by ID.
 * Returns 404 if supplier is not verified or not linked to store.
 */
posSuppliersRouter.get("/suppliers/:supplierId", requireDeviceToken, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as any).posDevice as { storeId: string };
  const { supplierId } = req.params;

  try {
    const result = await pool.query<{
      id: string;
      business_name: string;
      trade_name: string | null;
      gstin: string | null;
      primary_phone: string | null;
      primary_email: string | null;
      city: string | null;
      state: string | null;
      credit_days: number;
      min_order_value: number;
      expected_delivery_days: number;
      is_preferred: boolean;
      has_real_gstin: boolean;
    }>(
      `SELECT
         s.id,
         s.business_name,
         s.trade_name,
         s.gstin,
         s.primary_phone,
         s.primary_email,
         s.city,
         s.state,
         COALESCE(ssl.credit_days, 0) as credit_days,
         COALESCE(ssl.min_order_value, 0) as min_order_value,
         COALESCE(ssl.expected_delivery_days, 2) as expected_delivery_days,
         COALESCE(ssl.is_preferred, false) as is_preferred,
         (s.gstin IS NOT NULL AND s.gstin NOT LIKE 'XX%') as has_real_gstin
       FROM supplier.suppliers s
       JOIN supplier.supplier_store_links ssl ON s.id = ssl.supplier_id
       WHERE ssl.store_id = $1
         AND s.id = $2
         -- 10K STORE SCALE GATE:
         AND s.id IS NOT NULL
         AND s.verification_status = 'verified'
         AND ssl.status = 'active'`,
      [storeId, supplierId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Supplier not found or not verified",
      });
    }

    const row = result.rows[0];
    const supplier: PosSupplier = {
      id: row.id,
      supplierCode: row.id.substring(0, 8).toUpperCase(),
      businessName: row.business_name,
      tradeName: row.trade_name,
      gstin: row.gstin,
      primaryPhone: row.primary_phone,
      email: row.primary_email,
      city: row.city,
      state: row.state,
      creditDays: row.credit_days,
      minOrderValue: row.min_order_value,
      expectedDeliveryDays: row.expected_delivery_days,
      isPreferred: row.is_preferred,
      // 10K Store Scale verification contract (CRITICAL)
      supplierVerified: true,
      supplierAccountId: row.id,
      verificationSource: 'platform',
      // Explicit verification flags
      supplierAppRegistered: true,
      superAdminVerified: true,
      hasRealGstin: row.has_real_gstin,
    };

    return res.json({
      success: true,
      data: supplier,
    });
  } catch (error) {
    console.error("[pos/suppliers] Error fetching supplier:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch supplier",
    });
  }
});

/**
 * GET /api/v1/pos/suppliers/:supplierId/products
 * Get products available from a specific supplier.
 *
 * Queries catalog.supplier_products for active products belonging to this supplier.
 * Used by PurchaseScreen to show orderable products and by readinessGate probe.
 *
 * Response contract: { success: true, data: { products: [] } }
 */
posSuppliersRouter.get("/suppliers/:supplierId/products", requireDeviceToken, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ success: false, error: "database unavailable" });

  const { storeId } = (req as any).posDevice as { storeId: string };
  const { supplierId } = req.params;
  const { limit = "100", offset = "0" } = req.query;

  const limitNum = Math.min(parseInt(limit as string, 10) || 100, 500);
  const offsetNum = parseInt(offset as string, 10) || 0;

  try {
    // Verify supplier is verified and linked to this store
    const supplierCheck = await pool.query(
      `SELECT 1 FROM supplier.suppliers s
       JOIN supplier.supplier_store_links ssl ON s.id = ssl.supplier_id
       WHERE s.id = $1
         AND ssl.store_id = $2
         AND s.verification_status = 'verified'
         AND ssl.status = 'active'`,
      [supplierId, storeId]
    );

    if (supplierCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Supplier not found or not linked to this store",
      });
    }

    // Get supplier's product catalog
    const countResult = await pool.query(
      `SELECT COUNT(*) as total
       FROM catalog.supplier_products
       WHERE supplier_id = $1 AND is_active = true`,
      [supplierId]
    );
    const total = parseInt(countResult.rows[0]?.total || "0", 10);

    const result = await pool.query(
      `SELECT
         id,
         supplier_sku as "supplierSku",
         barcode,
         name,
         category,
         brand,
         unit,
         pack_size as "packSize",
         mrp,
         purchase_price as "purchasePrice",
         stock_quantity as "stockQuantity",
         stock_status as "stockStatus",
         moq
       FROM catalog.supplier_products
       WHERE supplier_id = $1 AND is_active = true
       ORDER BY name ASC
       LIMIT $2 OFFSET $3`,
      [supplierId, limitNum, offsetNum]
    );

    return res.json({
      success: true,
      data: {
        products: result.rows,
      },
      pagination: { total, limit: limitNum, offset: offsetNum },
    });
  } catch (error: any) {
    console.error("[pos/suppliers] Error fetching supplier products:", error.message);

    // Table might not exist yet
    if (error.code === "42P01") {
      return res.json({
        success: true,
        data: { products: [] },
        pagination: { total: 0, limit: limitNum, offset: offsetNum },
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to fetch supplier products",
    });
  }
});
