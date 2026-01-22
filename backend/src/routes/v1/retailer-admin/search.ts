// Retailer Admin Search Routes
// RCAT-SEARCH-001: Unified global search across products, suppliers, and barcodes
// Store-scoped via JWT (x-actor-id header from gateway)

import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";

export const retailerAdminSearchRouter = Router();

/**
 * Get store ID from gateway-provided headers
 */
function getStoreId(req: Request): string | null {
  const actorId = req.headers['x-actor-id'];
  return typeof actorId === 'string' ? actorId : null;
}

// =============================================================================
// GET /api/v1/retailer-admin/search?q=...&limit=...
// Unified search: products (name/alias/brand), suppliers (name/phone/gstin),
// barcodes (manufacturer + store-scoped)
// =============================================================================

retailerAdminSearchRouter.get("/search", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Store not identified" } });
  }

  const { q, limit } = req.query;
  const searchTerm = typeof q === 'string' ? q.trim() : '';

  if (!searchTerm || searchTerm.length < 2) {
    return res.json({ success: true, data: { products: [], suppliers: [], barcodes: [] } });
  }

  const limitNum = Math.min(parseInt(limit as string, 10) || 10, 50);
  const likeTerm = `%${searchTerm}%`;

  try {
    // 1. Search products by name, brand, alias (store-scoped)
    const productsResult = await pool.query(
      `SELECT
        sp.id,
        sp.product_id as "productId",
        p.name,
        p.brand,
        p.primary_barcode as "barcode",
        sp.product_mode as "mode",
        COALESCE(sp.sell_price, 0) as "sellPrice",
        COALESCE(sp.current_stock, 0) as "stock"
      FROM catalog.store_products sp
      INNER JOIN catalog.products p ON p.id = sp.product_id
      WHERE sp.store_id = $1
        AND sp.is_active = true
        AND (
          p.name ILIKE $2
          OR p.brand ILIKE $2
          OR p.description ILIKE $2
        )
      ORDER BY
        CASE WHEN p.name ILIKE $3 THEN 0 ELSE 1 END,
        p.name ASC
      LIMIT $4`,
      [storeId, likeTerm, `${searchTerm}%`, limitNum]
    );

    // 2. Search suppliers by business_name, phone, GSTIN (store-scoped via store links)
    const suppliersResult = await pool.query(
      `SELECT
        s.id,
        s.business_name as "businessName",
        s.primary_phone as "phone",
        s.gstin,
        s.verification_status as "verificationStatus",
        CASE WHEN s.verification_status = 'verified' THEN true ELSE false END as "isSupermandi"
      FROM supplier.suppliers s
      INNER JOIN supplier.supplier_store_links ssl ON ssl.supplier_id = s.id
      WHERE ssl.store_id = $1
        AND ssl.status = 'active'
        AND (
          s.business_name ILIKE $2
          OR s.primary_phone ILIKE $2
          OR s.gstin ILIKE $2
          OR s.trade_name ILIKE $2
        )
      ORDER BY
        CASE WHEN s.business_name ILIKE $3 THEN 0 ELSE 1 END,
        s.business_name ASC
      LIMIT $4`,
      [storeId, likeTerm, `${searchTerm}%`, limitNum]
    );

    // 3. Search barcodes - both manufacturer (primary_barcode) and store-scoped (store_product_barcodes)
    const barcodesResult = await pool.query(
      `SELECT
        sp.id as "storeProductId",
        sp.product_id as "productId",
        p.name as "productName",
        p.primary_barcode as "manufacturerBarcode",
        spb.barcode as "storeBarcode",
        sp.product_mode as "mode",
        COALESCE(sp.sell_price, 0) as "sellPrice"
      FROM catalog.store_products sp
      INNER JOIN catalog.products p ON p.id = sp.product_id
      LEFT JOIN catalog.store_product_barcodes spb ON spb.store_product_id = sp.id AND spb.store_id = sp.store_id
      WHERE sp.store_id = $1
        AND sp.is_active = true
        AND (
          p.primary_barcode ILIKE $2
          OR spb.barcode ILIKE $2
        )
      ORDER BY p.name ASC
      LIMIT $4`,
      [storeId, likeTerm, `${searchTerm}%`, limitNum]
    );

    return res.json({
      success: true,
      data: {
        products: productsResult.rows.map(r => ({
          ...r,
          sellPrice: Number(r.sellPrice) || 0,
          stock: Number(r.stock) || 0,
        })),
        suppliers: suppliersResult.rows,
        barcodes: barcodesResult.rows.map(r => ({
          ...r,
          sellPrice: Number(r.sellPrice) || 0,
          barcode: r.storeBarcode || r.manufacturerBarcode || '',
        })),
      },
    });
  } catch (err) {
    console.error("[RCAT-SEARCH-001] Search error:", err);
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Search failed" } });
  }
});
