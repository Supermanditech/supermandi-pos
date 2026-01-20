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
  gstin: string;
  primaryPhone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  // Store-specific terms from supplier_store_links
  creditDays: number;
  minOrderValue: number;
  expectedDeliveryDays: number;
  isPreferred: boolean;
  // Verification status
  supplierVerified: true; // Always true for POS (verified-only filter)
  supplierAccountId: string; // Same as id for verified suppliers
  verificationSource: 'platform';
}

/**
 * GET /api/v1/pos/suppliers
 * Get all VERIFIED suppliers linked to the store.
 *
 * CRITICAL: Only returns suppliers where:
 * - verification_status = 'verified'
 * - gstin is NOT NULL and does NOT start with 'XX'
 *
 * This enforces the 10K Store Scale rule that only verified
 * suppliers (isSupermandi=true) are visible on POS.
 */
posSuppliersRouter.get("/suppliers", requireDeviceToken, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as any).posDevice as { storeId: string };

  try {
    // Only fetch verified suppliers (isSupermandi=true)
    const result = await pool.query<{
      id: string;
      business_name: string;
      trade_name: string | null;
      gstin: string;
      primary_phone: string | null;
      primary_email: string | null;
      city: string | null;
      state: string | null;
      credit_days: number;
      min_order_value: number;
      expected_delivery_days: number;
      is_preferred: boolean;
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
         COALESCE(ssl.is_preferred, false) as is_preferred
       FROM supplier.suppliers s
       JOIN supplier.supplier_store_links ssl ON s.id = ssl.supplier_id
       WHERE ssl.store_id = $1
         AND ssl.status = 'active'
         -- CRITICAL: Only verified suppliers (10K Store Scale rule)
         AND s.verification_status = 'verified'
         AND s.gstin IS NOT NULL
         AND s.gstin NOT LIKE 'XX%'
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
      // Always verified for POS
      supplierVerified: true,
      supplierAccountId: row.id,
      verificationSource: 'platform',
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
      gstin: string;
      primary_phone: string | null;
      primary_email: string | null;
      city: string | null;
      state: string | null;
      credit_days: number;
      min_order_value: number;
      expected_delivery_days: number;
      is_preferred: boolean;
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
         COALESCE(ssl.is_preferred, false) as is_preferred
       FROM supplier.suppliers s
       JOIN supplier.supplier_store_links ssl ON s.id = ssl.supplier_id
       WHERE ssl.store_id = $1
         AND s.id = $2
         AND ssl.status = 'active'
         -- CRITICAL: Only verified suppliers
         AND s.verification_status = 'verified'
         AND s.gstin IS NOT NULL
         AND s.gstin NOT LIKE 'XX%'`,
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
      supplierVerified: true,
      supplierAccountId: row.id,
      verificationSource: 'platform',
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
