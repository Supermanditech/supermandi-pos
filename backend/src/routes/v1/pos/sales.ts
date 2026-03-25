import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { Router } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceToken } from "../../../middleware/deviceToken";
// GO-LIVE-184: Import rate limiters for financial operations
import {
  salesRateLimiter,
  financialOperationsRateLimiter
} from "../../../middleware/posRateLimiter";
// SEC-001: Import store status gate for ACTIVE store enforcement
import { requireActiveStore, requireOperationalStore } from "../../../middleware/storeStatusGate";
// V3-HARDEN-130: Store isolation enforcement — every route goes through this
import { assertStoreId } from "../../../services/storeIsolation";
import { logPosEventSafe } from "../../../services/posEventLogger"; // GCP-STG-0233
import { publishLifecycleEvent } from "../../../services/lifecycleEventService"; // GCP-STG-0382
import type { Request as ExpressRequest } from "express";
function getStoreIdFromPosDevice(req: ExpressRequest, operation: string): string {
  const storeId = (req as any).posDevice?.storeId as string | null | undefined;
  assertStoreId(storeId, operation);
  return storeId;
}
function getDeviceContextFromPosDevice(req: ExpressRequest, operation: string): { storeId: string; deviceId: string } {
  const posDevice = (req as any).posDevice as { storeId: string; deviceId: string } | undefined;
  assertStoreId(posDevice?.storeId, operation);
  return { storeId: posDevice!.storeId, deviceId: posDevice!.deviceId };
}
import {
  applyBulkDeductions,
  ensureSaleAvailability,
  ensureStandardVariants,
  ensureSupermandiBarcode,
  normalizeUnit,
  type BaseUnit
} from "../../../services/inventoryService";
// V3-FIX-167: Canonical conversion engine — authoritative unit math
import {
  getUnitMultiplier as canonicalGetUnitMultiplier,
  retailToStockDecrement,
  inferBaseStockUnit,
} from "../../../services/conversionEngine";
import {
  recordSaleInventoryMovements,
  recordSaleReturnMovements,
  ensureStoreInventoryAvailability,
  InsufficientStockError,
  StockVersionConflictError
} from "../../../services/inventoryLedgerService";
// GO-LIVE-034: Import stock cache invalidation for returns
import { invalidateStockCache } from "./inventory";
import { log } from "../../../lib/logger";
// GCP-STG-0077: Import invoice service for auto-generation after payment
import { createInvoice, issueInvoice, getInvoice } from "../../../services/invoiceService";
// GCP-STG-0361: Import PDF + QR services for POS invoice download
import { generateInvoicePdf } from "../../../services/invoicePdfService";
import { generateQrCodeBuffer } from "../../../services/eInvoiceService";
import type { Pool } from "pg";

export const posSalesRouter = Router();

/**
 * GCP-STG-0737: GET /api/v1/pos/alerts/unread
 * Returns unread alerts for the store (low stock, expiry, etc.)
 */
posSalesRouter.get("/alerts/unread", requireDeviceToken, async (req, res) => {
  const storeId = getStoreIdFromPosDevice(req, "pos/alerts/unread");
  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "SERVICE_UNAVAILABLE", message: "Database unavailable" });
  }
  try {
    const result = await pool.query(
      `SELECT id, alert_type, product_id, title, message, created_at
       FROM platform.store_alerts
       WHERE store_id = $1 AND is_read = false
       ORDER BY created_at DESC
       LIMIT 50`,
      [storeId]
    );
    return res.json({ alerts: result.rows, count: result.rows.length });
  } catch (error) {
    log.error("[GCP-STG-0737] Failed to fetch unread alerts:", error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch alerts" });
  }
});

type SaleItemInput = {
  productId?: string;
  storeProductId?: string;  // AUD-VM-042: catalog.store_products.id
  store_product_id?: string; // snake_case alias
  retailerVariantId?: string;
  retailer_variant_id?: string;
  retailVariantId?: string;   // T-060: catalog.product_retail_variants.id
  retail_variant_id?: string; // snake_case alias
  variantId?: string;
  globalProductId?: string;
  global_product_id?: string;
  quantity?: number;
  priceMinor?: number;
  name?: string;
  barcode?: string;
  batchNumber?: string;
  // GCP-STG-0118: Item-level discount from cart edits
  itemDiscount?: number;
  itemDiscountMinor?: number;
  item_discount?: number;
};

type BillPaymentMode = "UPI" | "CASH" | "DUE" | "UNKNOWN";

function buildBillRef(): string {
  // Use full timestamp + cryptographically secure random bytes to avoid collisions
  const ts = Date.now().toString();
  const randomBytes = require("crypto").randomBytes(3); // 3 bytes = 24 bits
  const rand = randomBytes.readUIntBE(0, 3).toString(36).toUpperCase().padStart(5, '0');
  return `${ts.slice(-8)}${rand}`; // 8-digit timestamp + 5-char random = 13 chars
}

function resolvePaymentMode(status: string | null | undefined): BillPaymentMode {
  const normalized = (status ?? "").toUpperCase();
  if (normalized.includes("UPI")) return "UPI";
  if (normalized.includes("CASH")) return "CASH";
  if (normalized.includes("DUE")) return "DUE";
  return "UNKNOWN";
}

// GO-LIVE-042: Stock reservation timeout (30 minutes)
// PENDING sales older than this are considered expired and cannot be paid
const SALE_RESERVATION_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * GO-LIVE-042: Check if sale reservation has expired
 * Returns true if the sale is too old to be paid
 */
function isSaleReservationExpired(saleCreatedAt: Date | string | null): boolean {
  if (!saleCreatedAt) return false;
  const created = saleCreatedAt instanceof Date ? saleCreatedAt : new Date(saleCreatedAt);
  if (isNaN(created.getTime())) return false;
  return Date.now() - created.getTime() > SALE_RESERVATION_TIMEOUT_MS;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

// Check if string is a valid UUID format (prevents PostgreSQL cast errors)
function isValidUUID(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Parse variant size string like "500g", "1kg", "250ml" into base unit and size.
 * V3-FIX-167: Now delegates to canonical conversionEngine for multiplier math.
 * Legacy normalizeUnit kept as fallback for "g"/"ml" base unit naming convention.
 */
function parseVariantSize(variantRaw: string | null | undefined): { baseUnit: BaseUnit; sizeBase: number } | null {
  if (!variantRaw) return null;
  const trimmed = variantRaw.trim().toLowerCase();
  if (!trimmed) return null;
  const match = trimmed.match(/(\d+(?:\.\d+)?)\s*(kg|g|gm|ml|l|ltr|pcs|dozen)\b/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  // V3-FIX-167: Use canonical engine multiplier for conversion
  const unitStr = match[2].toUpperCase().replace('G', 'GM').replace('L', 'LTR');
  const canonicalMultiplier = canonicalGetUnitMultiplier(unitStr, unitStr === 'GM' || unitStr === 'KG' ? 'GM' : 'ML');
  if (canonicalMultiplier !== null) {
    const sizeBase = Math.round(amount * canonicalMultiplier);
    if (sizeBase <= 0) return null;
    const baseUnit: BaseUnit = (unitStr === 'GM' || unitStr === 'KG') ? 'g' : 'ml';
    return { baseUnit, sizeBase };
  }

  // Legacy fallback for non-weight/volume units
  const unitInfo = normalizeUnit(match[2]);
  if (!unitInfo) return null;
  const sizeBase = Math.round(amount * unitInfo.multiplier);
  if (sizeBase <= 0) return null;
  return { baseUnit: unitInfo.baseUnit, sizeBase };
}

async function ensureRetailerVariantLink(
  client: PoolClient,
  storeId: string,
  variantId: string
): Promise<void> {
  await client.query(
    `
    INSERT INTO retailer_variants (store_id, variant_id, digitised_by_retailer)
    VALUES ($1, $2, TRUE)
    ON CONFLICT (store_id, variant_id) DO NOTHING
    `,
    [storeId, variantId]
  );
}

/**
 * AUD-VM-042 FIX: Bridge catalog.store_products to variants table for sales
 * This allows products digitised via catalog schema to be sold.
 * Creates a variant on-the-fly if one doesn't exist for the catalog product.
 */
// AUD-VM-042+033 FIX: Return both variantId AND productId (globalProductId)
// The productId is needed for stock availability check in ensureStoreInventoryAvailability
type CatalogResolution = { variantId: string; globalProductId: string } | null;

async function resolveVariantFromCatalogProduct(params: {
  client: PoolClient;
  storeId: string;
  storeProductId?: string;
  productId?: string;
  barcode?: string;
  currency: string;
}): Promise<CatalogResolution> {
  const { client, storeId, storeProductId, productId, barcode, currency } = params;

  // Step 1: Find the catalog store_product
  // V3-FIX-167: Include conversion profile for authoritative unit math
  let catalogProduct: {
    store_product_id: string;
    product_id: string;
    display_name: string;
    primary_barcode: string | null;
    unit: string | null;
    product_mode: string | null;
    base_stock_unit: string | null;
    conversion_confirmed: boolean;
  } | null = null;

  if (storeProductId && isValidUUID(storeProductId)) {
    const res = await client.query(
      `SELECT sp.id as store_product_id, sp.product_id,
              COALESCE(sp.display_name, p.name) as display_name,
              p.primary_barcode, p.unit,
              sp.product_mode, sp.base_stock_unit, sp.conversion_confirmed
       FROM catalog.store_products sp
       JOIN catalog.products p ON p.id = sp.product_id
       WHERE sp.id = $1 AND sp.store_id = $2`,
      [storeProductId, storeId]
    );
    if (res.rows[0]) {
      catalogProduct = res.rows[0];
    }
  } else if (productId && isValidUUID(productId)) {
    const res = await client.query(
      `SELECT sp.id as store_product_id, sp.product_id,
              COALESCE(sp.display_name, p.name) as display_name,
              p.primary_barcode, p.unit
       FROM catalog.store_products sp
       JOIN catalog.products p ON p.id = sp.product_id
       WHERE sp.product_id = $1 AND sp.store_id = $2`,
      [productId, storeId]
    );
    if (res.rows[0]) {
      catalogProduct = res.rows[0];
    }
  } else if (barcode) {
    // Try to find by barcode in catalog schema
    const res = await client.query(
      `SELECT sp.id as store_product_id, sp.product_id,
              COALESCE(sp.display_name, p.name) as display_name,
              p.primary_barcode, p.unit
       FROM catalog.store_products sp
       JOIN catalog.products p ON p.id = sp.product_id
       LEFT JOIN catalog.store_product_barcodes spb
         ON spb.store_product_id = sp.id AND spb.store_id = sp.store_id
       WHERE sp.store_id = $1 AND (p.primary_barcode = $2 OR spb.barcode = $2)
       LIMIT 1`,
      [storeId, barcode]
    );
    if (res.rows[0]) {
      catalogProduct = res.rows[0];
    }
  }

  // T-060: If not found via standard lookup, check retail variant barcodes (prefix 3)
  if (!catalogProduct && barcode) {
    const rvRes = await client.query(
      `SELECT sp.id as store_product_id, sp.product_id,
              COALESCE(sp.display_name, p.name) as display_name,
              p.primary_barcode, p.unit
       FROM catalog.product_retail_variants prv
       JOIN catalog.store_products sp ON sp.id = prv.store_product_id
       JOIN catalog.products p ON p.id = sp.product_id
       WHERE prv.barcode = $1 AND sp.store_id = $2 AND prv.is_active = true AND sp.is_active = true
       LIMIT 1`,
      [barcode, storeId]
    );
    if (rvRes.rows[0]) {
      catalogProduct = rvRes.rows[0];
    }
  }

  if (!catalogProduct) {
    return null;
  }

  // Step 2: Check if variant already exists for this product
  const existingVariant = await client.query(
    `SELECT v.id FROM variants v
     WHERE v.product_id = $1
     ORDER BY v.created_at ASC
     LIMIT 1`,
    [catalogProduct.product_id]
  );

  if (existingVariant.rows[0]?.id) {
    const variantId = String(existingVariant.rows[0].id);
    await ensureRetailerVariantLink(client, storeId, variantId);
    return { variantId, globalProductId: catalogProduct.product_id };
  }

  // Step 3: Create variant for the catalog product (bridge)
  const variantId = randomUUID();
  const productName = catalogProduct.display_name || `Item ${catalogProduct.product_id.slice(-4)}`;

  // Ensure products table has the entry (for FK constraint)
  await client.query(
    `INSERT INTO products (id, name, category, retailer_status, enrichment_status)
     VALUES ($1, $2, NULL, 'retailer_created', 'pending_enrichment')
     ON CONFLICT (id) DO NOTHING`,
    [catalogProduct.product_id, productName]
  );

  // Create the variant
  await client.query(
    `INSERT INTO variants (id, product_id, name, currency)
     VALUES ($1, $2, $3, $4)`,
    [variantId, catalogProduct.product_id, productName, currency]
  );

  // Link barcode if exists
  if (catalogProduct.primary_barcode) {
    await client.query(
      `INSERT INTO barcodes (barcode, variant_id, barcode_type)
       VALUES ($1, $2, 'primary')
       ON CONFLICT (barcode) DO NOTHING`,
      [catalogProduct.primary_barcode, variantId]
    );
  }

  // Ensure supermandi barcode
  await ensureSupermandiBarcode(client, variantId);

  // Link to retailer
  await ensureRetailerVariantLink(client, storeId, variantId);

  return { variantId, globalProductId: catalogProduct.product_id };
}

async function findVariantForProduct(params: {
  client: PoolClient;
  storeId: string;
  productId: string;
  baseUnit: BaseUnit;
  preferredSizeBase: number | null;
}): Promise<string | null> {
  const { client, storeId, productId, baseUnit, preferredSizeBase } = params;

  if (preferredSizeBase !== null) {
    const preferred = await client.query(
      `
      SELECT id
      FROM variants
      WHERE product_id = $1 AND unit_base = $2 AND size_base = $3
      LIMIT 1
      `,
      [productId, baseUnit, preferredSizeBase]
    );
    if (preferred.rows[0]?.id) {
      const variantId = String(preferred.rows[0].id);
      await ensureRetailerVariantLink(client, storeId, variantId);
      return variantId;
    }
  }

  const standard = await client.query(
    `
    SELECT id
    FROM variants
    WHERE product_id = $1 AND unit_base = $2 AND size_base = 1000
    LIMIT 1
    `,
    [productId, baseUnit]
  );
  if (standard.rows[0]?.id) {
    const variantId = String(standard.rows[0].id);
    await ensureRetailerVariantLink(client, storeId, variantId);
    return variantId;
  }

  const fallback = await client.query(
    `
    SELECT id
    FROM variants
    WHERE product_id = $1 AND unit_base = $2
    ORDER BY size_base ASC, created_at ASC
    LIMIT 1
    `,
    [productId, baseUnit]
  );
  if (fallback.rows[0]?.id) {
    const variantId = String(fallback.rows[0].id);
    await ensureRetailerVariantLink(client, storeId, variantId);
    return variantId;
  }

  return null;
}

async function resolveVariantForGlobalProduct(params: {
  client: PoolClient;
  storeId: string;
  globalProductId: string;
  fallbackName?: string | null;
  currency: string;
}): Promise<string | null> {
  const { client, storeId, globalProductId, fallbackName, currency } = params;
  const productRes = await client.query(
    `
    SELECT gp.global_name, sp.store_display_name, sp.unit, sp.variant
    FROM global_products gp
    LEFT JOIN store_products sp
      ON sp.global_product_id = gp.id AND sp.store_id = $2
    WHERE gp.id = $1
    LIMIT 1
    `,
    [globalProductId, storeId]
  );

  const productRow = productRes.rows[0];
  if (!productRow) return null;

  const globalName = productRow.global_name ? String(productRow.global_name) : "";
  const storeName = productRow.store_display_name ? String(productRow.store_display_name) : null;
  const unitRaw = productRow.unit ? String(productRow.unit) : null;
  const variantRaw = productRow.variant ? String(productRow.variant) : null;
  const productName =
    storeName ||
    globalName ||
    (fallbackName ? fallbackName.trim() : "") ||
    `Item ${globalProductId.slice(-4)}`;

  const linkedRes = await client.query(
    `
    SELECT v.id
    FROM variants v
    JOIN retailer_variants rv
      ON rv.variant_id = v.id AND rv.store_id = $1::uuid
    WHERE v.product_id = $2
    ORDER BY v.size_base NULLS LAST, v.created_at ASC
    LIMIT 1
    `,
    [storeId, globalProductId]
  );
  if (linkedRes.rows[0]?.id) {
    return String(linkedRes.rows[0].id);
  }

  const existingVariant = await client.query(
    `
    SELECT v.id
    FROM variants v
    WHERE v.product_id = $1
    ORDER BY v.size_base NULLS LAST, v.created_at ASC
    LIMIT 1
    `,
    [globalProductId]
  );
  if (existingVariant.rows[0]?.id) {
    const variantId = String(existingVariant.rows[0].id);
    await ensureRetailerVariantLink(client, storeId, variantId);
    return variantId;
  }

  await client.query(
    `
    INSERT INTO products (id, name, category, retailer_status, enrichment_status)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (id) DO NOTHING
    `,
    [globalProductId, productName, null, "retailer_created", "pending_enrichment"]
  );

  const unitInfo = normalizeUnit(unitRaw);
  const variantSize = parseVariantSize(variantRaw);
  const baseUnit = unitInfo?.baseUnit ?? variantSize?.baseUnit ?? null;
  const preferredSizeBase =
    variantSize && (!baseUnit || variantSize.baseUnit === baseUnit) ? variantSize.sizeBase : null;

  if (baseUnit) {
    await ensureStandardVariants({
      client,
      productId: globalProductId,
      productName,
      currency,
      baseUnit,
      storeId
    });

    const variantId = await findVariantForProduct({
      client,
      storeId,
      productId: globalProductId,
      baseUnit,
      preferredSizeBase
    });
    if (variantId) return variantId;
  }

  const variantId = randomUUID();
  await client.query(
    `
    INSERT INTO variants (id, product_id, name, currency)
    VALUES ($1, $2, $3, $4)
    `,
    [variantId, globalProductId, productName, currency]
  );
  await ensureSupermandiBarcode(client, variantId);
  await ensureRetailerVariantLink(client, storeId, variantId);
  return variantId;
}

async function variantExists(client: PoolClient, variantId: string): Promise<boolean> {
  const res = await client.query(
    `
    SELECT 1
    FROM variants
    WHERE id = $1
    LIMIT 1
    `,
    [variantId]
  );
  return (res.rowCount ?? 0) > 0;
}

// Resolve variant ID from barcode (for offline-to-online sales with barcode as productId)
async function resolveVariantByBarcode(
  client: PoolClient,
  storeId: string,
  barcode: string,
  fallbackName: string | null,
  currency: string
): Promise<string | null> {
  const trimmed = barcode.trim();
  if (!trimmed) return null;

  // First try to find existing variant by barcode
  const barcodeRes = await client.query(
    `
    SELECT v.id
    FROM barcodes b
    JOIN variants v ON v.id = b.variant_id
    WHERE b.barcode = $1
    LIMIT 1
    `,
    [trimmed]
  );

  if (barcodeRes.rows[0]?.id) {
    const variantId = String(barcodeRes.rows[0].id);
    await ensureRetailerVariantLink(client, storeId, variantId);
    return variantId;
  }

  // Try to find global product by barcode identifier
  const globalRes = await client.query(
    `
    SELECT gpi.global_product_id
    FROM global_product_identifiers gpi
    WHERE gpi.normalized_value = $1
       OR gpi.raw_value = $1
    LIMIT 1
    `,
    [trimmed]
  );

  if (globalRes.rows[0]?.global_product_id) {
    const globalProductId = String(globalRes.rows[0].global_product_id);
    return resolveVariantForGlobalProduct({
      client,
      storeId,
      globalProductId,
      fallbackName,
      currency
    });
  }

  return null;
}

/**
 * T-060: Convert variant units to parent product units for stock deduction.
 * When a retail variant (e.g., 500 GM of a KG-tracked product) is sold,
 * the stock deduction must be in the parent's unit (0.5 KG per pack).
 *
 * Returns the multiplier: sale_qty * multiplier = effective stock deduction.
 * Returns 1 if no conversion needed or if variant not found.
 */
async function getRetailVariantStockMultiplier(
  client: PoolClient,
  retailVariantId: string,
  storeId: string
): Promise<number> {
  if (!retailVariantId || !isValidUUID(retailVariantId)) return 1;

  const res = await client.query(
    `SELECT prv.variant_qty, prv.base_unit, p.unit AS parent_unit
     FROM catalog.product_retail_variants prv
     JOIN catalog.store_products sp ON sp.id = prv.store_product_id
     JOIN catalog.products p ON p.id = sp.product_id
     WHERE prv.id = $1 AND sp.store_id = $2 AND prv.is_active = true`,
    [retailVariantId, storeId]
  );

  if (!res.rows[0]) return 1;

  const { variant_qty, base_unit, parent_unit } = res.rows[0];
  const qty = Number(variant_qty);
  if (!Number.isFinite(qty) || qty <= 0) return 1;

  const variantUnit = (base_unit || "").toUpperCase();
  const parentUnit = (parent_unit || "").toUpperCase();

  if (!variantUnit || !parentUnit) return qty;
  if (variantUnit === parentUnit) return qty;

  // V3-FIX-167: Use canonical conversion engine instead of hardcoded map
  const factor = canonicalGetUnitMultiplier(variantUnit, parentUnit);
  if (factor !== null) {
    return qty * factor;
  }

  // No known conversion — use variant_qty directly (best effort)
  return qty;
}

async function getStore(storeId: string): Promise<{ id: string; name: string; upi_vpa: string | null; active: boolean; max_discount_percent: number } | null> {
  const pool = getPool();
  if (!pool) return null;
  try {
    // AUD-053-A FIX: Query actual upi_vpa from database instead of hardcoding null
    // BATCH-3 FIX: Use uppercase 'ACTIVE' to match StoreStatus enum
    // SA-P0-002: Also fetch max_discount_percent for discount limit enforcement
    const res = await pool.query(
      `SELECT id::TEXT as id, name, upi_vpa, (status = 'ACTIVE') as active, max_discount_percent FROM platform.stores WHERE id = $1::uuid`,
      [storeId]
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      id: String(row.id),
      name: String(row.name || ''),
      upi_vpa: row.upi_vpa ? String(row.upi_vpa) : null,
      active: Boolean(row.active),
      max_discount_percent: Number(row.max_discount_percent ?? 100)
    };
  } catch (err: any) {
    log.error("[sales/getStore] Query failed:", err?.message);
    return null;
  }
}

async function getSale(
  storeId: string,
  saleId: string
): Promise<{ id: string; store_id: string; bill_ref: string; total_minor: number } | null> {
  const pool = getPool();
  if (!pool) return null;
  const res = await pool.query(
    `SELECT id, store_id, bill_ref, total_minor FROM sales WHERE id = $1 AND store_id = $2`,
    [saleId, storeId]
  );
  return res.rows[0] ?? null;
}

// TICKET-002: Daily Summary for POS home screen
posSalesRouter.get("/daily-summary", requireDeviceToken, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromPosDevice(req, "pos/sales");
  const dateParam = typeof req.query.date === "string" ? req.query.date.trim() : null;

  // Use provided date or default to today (store timezone assumed UTC for now)
  const targetDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
    ? dateParam
    : new Date().toISOString().slice(0, 10);

  try {
    // Aggregate sales for the target date (only confirmed sales)
    const summaryRes = await pool.query(
      `
      SELECT
        COUNT(*)::int AS total_bills,
        COALESCE(SUM(total_minor), 0)::bigint AS total_sales,
        COUNT(*) FILTER (WHERE status = 'PAID_CASH')::int AS cash_count,
        COALESCE(SUM(total_minor) FILTER (WHERE status = 'PAID_CASH'), 0)::bigint AS cash_total,
        COUNT(*) FILTER (WHERE status = 'PAID_UPI')::int AS upi_count,
        COALESCE(SUM(total_minor) FILTER (WHERE status = 'PAID_UPI'), 0)::bigint AS upi_total,
        COUNT(*) FILTER (WHERE status = 'DUE')::int AS due_count,
        COALESCE(SUM(total_minor) FILTER (WHERE status = 'DUE'), 0)::bigint AS due_total,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS split_count,
        COALESCE(SUM(total_minor) FILTER (WHERE status = 'completed'), 0)::bigint AS split_total
      FROM sales
      WHERE store_id = $1
        AND status IN ('PAID_CASH', 'PAID_UPI', 'DUE', 'completed')
        AND DATE(created_at AT TIME ZONE 'Asia/Kolkata') = $2::date
      `,
      [storeId, targetDate]
    );

    const row = summaryRes.rows[0] || {};
    const totalBills = Number(row.total_bills || 0);
    const totalSales = Number(row.total_sales || 0);
    const averageBillValue = totalBills > 0 ? Math.round(totalSales / totalBills) : 0;

    // Get items sold count and top selling items — STG-156: IST timezone
    const itemsRes = await pool.query(
      `
      SELECT
        COALESCE(si.name, 'Unknown') AS product_name,
        si.variant_id AS product_id,
        SUM(si.quantity)::int AS quantity_sold,
        SUM(si.line_total_minor)::bigint AS total_amount
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      WHERE s.store_id = $1
        AND s.status IN ('PAID_CASH', 'PAID_UPI', 'DUE', 'completed', 'SPLIT')
        AND DATE(s.created_at AT TIME ZONE 'Asia/Kolkata') = $2::date
      GROUP BY si.variant_id, si.name
      ORDER BY quantity_sold DESC
      LIMIT 10
      `,
      [storeId, targetDate]
    );

    const topSellingItems = itemsRes.rows.map((r) => ({
      productId: String(r.product_id || ""),
      productName: String(r.product_name || "Unknown"),
      quantitySold: Number(r.quantity_sold || 0),
      totalAmount: Number(r.total_amount || 0),
    }));

    const itemsSold = topSellingItems.reduce((sum, item) => sum + item.quantitySold, 0);

    return res.json({
      success: true,
      data: {
        date: targetDate,
        totalSales,
        totalBills,
        averageBillValue,
        paymentBreakdown: {
          cash: Number(row.cash_total || 0),
          upi: Number(row.upi_total || 0),
          card: 0,
          credit: Number(row.due_total || 0),
          split: Number(row.split_total || 0), // XPLAT-004
        },
        itemsSold,
        topSellingItems,
      },
    });
  } catch (error) {
    log.error("[daily-summary] Error:", error);
    return res.status(500).json({ error: "failed to load daily summary" });
  }
});

posSalesRouter.get("/bills", requireDeviceToken, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 50;
  const offsetRaw = typeof req.query.offset === "string" ? Number(req.query.offset) : 0;
  const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, Math.floor(limitRaw))) : 50;
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0;

  const storeId = getStoreIdFromPosDevice(req, "pos/sales");

  try {
    const rows = await pool.query(
      `
      SELECT id, bill_ref, total_minor, status, created_at, currency
      FROM sales
      WHERE store_id = $1 AND status NOT IN ('CREATED', 'PENDING', 'CANCELLED')
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [storeId, limit, offset]
    );

    const bills = rows.rows.map((row) => ({
      saleId: String(row.id),
      billRef: String(row.bill_ref),
      totalMinor: Number(row.total_minor ?? 0),
      status: String(row.status ?? ""),
      paymentMode: resolvePaymentMode(row.status),
      // STG-515: TIMESTAMPTZ columns are returned as JS Date by pg driver — toISOString() is UTC-safe
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at ?? ""),
      currency: row.currency ? String(row.currency) : "INR"
    }));

    return res.json({ bills });
  } catch (error) {
    return res.status(500).json({ error: "failed to load bills" });
  }
});

posSalesRouter.get("/bills/:saleId", requireDeviceToken, async (req, res) => {
  const saleId = typeof req.params.saleId === "string" ? req.params.saleId.trim() : "";
  if (!saleId) {
    return res.status(400).json({ error: "saleId is required" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromPosDevice(req, "pos/sales");

  try {
    const saleRes = await pool.query(
      `
      SELECT id, store_id, bill_ref, subtotal_minor, discount_minor, total_minor, status, created_at, currency
      FROM sales
      WHERE id = $1 AND store_id = $2
      `,
      [saleId, storeId]
    );
    const sale = saleRes.rows[0];
    if (!sale) {
      return res.status(404).json({ error: "bill_not_found" });
    }

    const itemRes = await pool.query(
      `
      SELECT
        si.variant_id,
        si.quantity,
        si.price_minor,
        si.line_total_minor,
        COALESCE(si.item_name, v.name) AS item_name,
        COALESCE(si.barcode, b.barcode) AS barcode
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      LEFT JOIN variants v ON v.id = si.variant_id
      LEFT JOIN barcodes b ON b.variant_id = si.variant_id AND b.barcode_type = 'supermandi'
      WHERE si.sale_id = $1 AND s.store_id = $2
      ORDER BY si.id ASC
      `,
      [saleId, storeId]
    );

    const bill = {
      saleId: String(sale.id),
      billRef: String(sale.bill_ref),
      status: String(sale.status ?? ""),
      paymentMode: resolvePaymentMode(sale.status),
      currency: sale.currency ? String(sale.currency) : "INR",
      // STG-515: TIMESTAMPTZ columns are returned as JS Date by pg driver — toISOString() is UTC-safe
      createdAt: sale.created_at instanceof Date ? sale.created_at.toISOString() : String(sale.created_at ?? ""),
      totals: {
        subtotalMinor: Number(sale.subtotal_minor ?? 0),
        discountMinor: Number(sale.discount_minor ?? 0),
        totalMinor: Number(sale.total_minor ?? 0)
      },
      items: itemRes.rows.map((row) => ({
        variantId: String(row.variant_id),
        name: String(row.item_name ?? ""),
        barcode: row.barcode ? String(row.barcode) : null,
        quantity: Number(row.quantity ?? 0),
        priceMinor: Number(row.price_minor ?? 0),
        lineTotalMinor: Number(row.line_total_minor ?? 0)
      }))
    };

    return res.json({ bill });
  } catch (error) {
    return res.status(500).json({ error: "failed to load bill" });
  }
});

async function getPaymentStoreStatus(
  storeId: string,
  paymentId: string
): Promise<{ sale_id: string; store_id: string; active: boolean } | null> {
  const pool = getPool();
  if (!pool) return null;
  const res = await pool.query(
    `
      SELECT p.sale_id, s.store_id, (st.status = 'ACTIVE') AS active
      FROM payments p
      JOIN sales s ON s.id = p.sale_id
      JOIN platform.stores st ON st.id = s.store_id::uuid
      WHERE p.id = $1 AND s.store_id = $2
    `,
    [paymentId, storeId]
  );
  return res.rows[0] ?? null;
}

async function getCollectionStoreStatus(
  storeId: string,
  collectionId: string
): Promise<{ store_id: string; active: boolean } | null> {
  const pool = getPool();
  if (!pool) return null;
  const res = await pool.query(
    `
      SELECT c.store_id, (st.status = 'ACTIVE') AS active
      FROM collections c
      JOIN platform.stores st ON st.id = c.store_id::uuid
      WHERE c.id = $1 AND c.store_id = $2
    `,
    [collectionId, storeId]
  );
  return res.rows[0] ?? null;
}

// GO-LIVE-184: Rate limit sales creation to 60/min per store
// SEC-001: POST /sales requires ACTIVE store status
posSalesRouter.post("/sales", requireDeviceToken, requireActiveStore, salesRateLimiter, async (req, res) => {
  // GCP-STG-0655: Accept optional totalAmount from frontend for server-side validation
  const { items, discountMinor, currency, saleId: requestedSaleIdRaw, totalAmount: frontendTotalAmount } = req.body as {
    items?: SaleItemInput[];
    discountMinor?: number;
    currency?: string;
    saleId?: string;
    totalAmount?: number;
  };

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "items are required" });
  }

  const cleanedItems = items.map((item) => {
    const explicitVariantId =
      asTrimmedString(item.retailerVariantId) ??
      asTrimmedString(item.retailer_variant_id) ??
      asTrimmedString(item.variantId);
    const productId = asTrimmedString(item.productId);
    // AUD-VM-042: Support storeProductId from catalog schema
    const storeProductId =
      asTrimmedString(item.storeProductId) ?? asTrimmedString(item.store_product_id);
    const globalProductId =
      asTrimmedString(item.globalProductId) ?? asTrimmedString(item.global_product_id);
    // T-060: Retail variant ID for stock quantity conversion
    const retailVariantId =
      asTrimmedString(item.retailVariantId) ?? asTrimmedString(item.retail_variant_id);
    // V3-HARDEN-171: Allow fractional quantities for loose/bulk products (0.25 kg, 0.5 L)
    // Round to 3 decimal places instead of integer to support sub-unit sells
    const quantity =
      typeof item.quantity === "number" && Number.isFinite(item.quantity)
        ? Math.round(item.quantity * 1000) / 1000
        : NaN;
    const priceMinor =
      typeof item.priceMinor === "number" && Number.isFinite(item.priceMinor)
        ? Math.round(item.priceMinor)
        : NaN;
    return {
      explicitVariantId,
      productId,
      storeProductId,
      globalProductId,
      retailVariantId,
      name: asTrimmedString(item.name) ?? undefined,
      barcode: asTrimmedString(item.barcode) ?? undefined,
      quantity,
      priceMinor,
      batchNumber: asTrimmedString(item.batchNumber) ?? undefined
    };
  });

  // Validation constants to prevent overflow and abuse
  const MAX_QUANTITY = 100000; // Maximum 100k items per line
  const MAX_PRICE_MINOR = 1000000000; // GO-LIVE-050: Maximum 10 million INR per item (standardized)
  // AUD-059-B FIX: Name/barcode length bounds
  const MAX_NAME_LENGTH = 200;
  const MAX_BARCODE_LENGTH = 50;

  const invalidItem = cleanedItems.find(
    (item) =>
      // AUD-VM-042: Accept storeProductId as valid product identifier
      (!item.explicitVariantId && !item.productId && !item.storeProductId && !item.globalProductId && !item.barcode) ||
      !Number.isFinite(item.quantity) ||
      item.quantity <= 0 ||
      item.quantity > MAX_QUANTITY ||
      !Number.isFinite(item.priceMinor) ||
      item.priceMinor <= 0 ||
      item.priceMinor > MAX_PRICE_MINOR ||
      // AUD-059-B FIX: Validate name/barcode length bounds
      (item.name && item.name.length > MAX_NAME_LENGTH) ||
      (item.barcode && item.barcode.length > MAX_BARCODE_LENGTH)
  );

  if (invalidItem) {
    return res.status(400).json({
      error: "items are invalid",
      message: "Item quantity must be between 1 and 100,000. Price must be between 1 and 10,000,000 INR."
    });
  }

  const subtotal = cleanedItems.reduce((sum, item) => sum + item.priceMinor * item.quantity, 0);

  // GO-LIVE-116: Protect against integer overflow with extreme values
  // MAX_SAFE_INTEGER ensures JavaScript precision is maintained
  const MAX_SAFE_TOTAL = 9007199254740991; // Number.MAX_SAFE_INTEGER
  if (subtotal > MAX_SAFE_TOTAL) {
    return res.status(422).json({
      error: {
        code: "SUBTOTAL_OVERFLOW",
        message: "Order total exceeds maximum safe value. Please reduce item quantities or prices."
      }
    });
  }

  // GO-LIVE-115: Cap discount to subtotal to prevent negative bills
  // Also prevents storing invalid data where discount > subtotal
  const rawDiscount = Math.max(0, Math.round(discountMinor ?? 0));
  const discount = Math.min(rawDiscount, subtotal);
  const total = subtotal - discount; // No Math.max(0,...) needed since discount <= subtotal

  // GCP-STG-0655: Server-side amount validation — if frontend sends totalAmount, verify it matches
  // server-recalculated total within ₹1 tolerance (100 paise) for rounding differences.
  // The server NEVER trusts the frontend amount; this is a defense-in-depth mismatch detector.
  if (typeof frontendTotalAmount === "number" && Number.isFinite(frontendTotalAmount)) {
    const AMOUNT_TOLERANCE_MINOR = 100; // ₹1 in paise
    if (Math.abs(total - frontendTotalAmount) > AMOUNT_TOLERANCE_MINOR) {
      return res.status(400).json({
        error: "AMOUNT_MISMATCH",
        message: "Frontend total does not match server-calculated total",
        serverTotal: total,
        frontendTotal: frontendTotalAmount,
      });
    }
  }

  const saleCurrency = typeof currency === "string" && currency.trim() ? currency.trim() : "INR";
  const requestedSaleId = asTrimmedString(requestedSaleIdRaw);

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId, deviceId } = getDeviceContextFromPosDevice(req, "pos/sales");
  const store = await getStore(storeId);
  if (!store) {
    return res.status(404).json({ error: "store not found" });
  }

  // SA-P0-002: Enforce store-level maximum discount percentage
  if (subtotal > 0 && discount > 0) {
    const discountPercent = (discount / subtotal) * 100;
    if (discountPercent > store.max_discount_percent) {
      return res.status(422).json({
        error: {
          code: "DISCOUNT_LIMIT_EXCEEDED",
          message: `Discount of ${discountPercent.toFixed(2)}% exceeds the store maximum of ${store.max_discount_percent}%`,
          maxAllowed: store.max_discount_percent,
        },
      });
    }
  }

  // GCP-STG-0099: Backend guard — reject zero-amount sales (defense-in-depth)
  if (total <= 0) {
    return res.status(422).json({
      error: {
        code: "ZERO_AMOUNT_SALE",
        message: "Cannot create a sale with zero or negative total amount",
      },
    });
  }

  if (requestedSaleId) {
    const existing = await pool.query(
      `
      SELECT id, bill_ref, subtotal_minor, discount_minor, total_minor
      FROM sales
      WHERE id = $1 AND store_id = $2
      LIMIT 1
      `,
      [requestedSaleId, storeId]
    );
    const row = existing.rows[0];
    if (row) {
      return res.json({
        saleId: String(row.id),
        billRef: String(row.bill_ref),
        totals: {
          subtotalMinor: Number(row.subtotal_minor ?? 0),
          discountMinor: Number(row.discount_minor ?? 0),
          totalMinor: Number(row.total_minor ?? 0)
        }
      });
    }
  }
  if (!store.active) {
    return res.status(403).json({ error: "store_inactive" });
  }

  const saleId = requestedSaleId ?? randomUUID();
  let billRef = buildBillRef();

  // DATA-005: Server-side retry for SERIALIZABLE transaction conflicts (max 3 retries with backoff)
  const MAX_SERIALIZATION_RETRIES = 3;
  let serializationRetryDelay = 0;
  for (let serializationAttempt = 0; serializationAttempt <= MAX_SERIALIZATION_RETRIES; serializationAttempt++) {
    if (serializationRetryDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, serializationRetryDelay));
    }
    serializationRetryDelay = 0;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Set SERIALIZABLE isolation to prevent race conditions in inventory deduction
    await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    // GCP-STG-0084 FIX: Set RLS store context for defense-in-depth
    await client.query("SELECT set_config('app.current_store_id', $1::text, true)", [storeId]);

    const resolvedItems: Array<{
      variantId: string;
      quantity: number;
      stockQuantity: number; // T-060: effective quantity for stock deduction (may differ for retail variants)
      priceMinor: number;
      name?: string;
      barcode?: string;
      globalProductId?: string;
      batchNumber?: string | null;
    }> = [];

    for (const item of cleanedItems) {
      let variantId: string | null = null;
      if (item.explicitVariantId) {
        variantId = item.explicitVariantId;
      } else if (item.globalProductId && isValidUUID(item.globalProductId)) {
        variantId = await resolveVariantForGlobalProduct({
          client,
          storeId,
          globalProductId: item.globalProductId,
          fallbackName: item.name ?? null,
          currency: saleCurrency
        });
      } else if (item.productId && isValidUUID(item.productId)) {
        // productId is a valid UUID - try as variant or global product
        if (await variantExists(client, item.productId)) {
          variantId = item.productId;
        } else {
          variantId = await resolveVariantForGlobalProduct({
            client,
            storeId,
            globalProductId: item.productId,
            fallbackName: item.name ?? null,
            currency: saleCurrency
          });
        }
      } else if (item.barcode) {
        // productId is not a valid UUID (e.g., offline sale with barcode as ID)
        // Fall back to resolving by barcode
        variantId = await resolveVariantByBarcode(
          client,
          storeId,
          item.barcode,
          item.name ?? null,
          saleCurrency
        );
      } else if (item.productId) {
        // Last resort: try productId as barcode (for offline items where barcode was used as id)
        variantId = await resolveVariantByBarcode(
          client,
          storeId,
          item.productId,
          item.name ?? null,
          saleCurrency
        );
      }

      // AUD-VM-042+033 FIX: Try catalog schema bridge if no variant found
      // This enables sales of products digitised via catalog schema
      // Returns both variantId and globalProductId for stock check
      let catalogGlobalProductId: string | undefined = item.globalProductId ?? undefined;
      if (!variantId) {
        const catalogResolution = await resolveVariantFromCatalogProduct({
          client,
          storeId,
          storeProductId: item.storeProductId ?? item.productId ?? undefined, // Try explicit storeProductId first
          productId: item.globalProductId ?? item.productId ?? undefined,
          barcode: item.barcode,
          currency: saleCurrency
        });
        if (catalogResolution) {
          variantId = catalogResolution.variantId;
          catalogGlobalProductId = catalogResolution.globalProductId;
        }
      }

      if (!variantId) {
        throw new Error("product_not_found");
      }

      // V3-HARDEN-171: Block sale of unconverted bulk products
      // Check via storeProductId, globalProductId, or barcode — all checkout paths covered
      {
        let convCheckSql = '';
        const convCheckParams: any[] = [storeId];
        if (item.storeProductId && isValidUUID(item.storeProductId)) {
          convCheckSql = `SELECT conversion_confirmed, product_mode FROM catalog.store_products WHERE id = $2 AND store_id = $1`;
          convCheckParams.push(item.storeProductId);
        } else if (catalogGlobalProductId && isValidUUID(catalogGlobalProductId)) {
          convCheckSql = `SELECT conversion_confirmed, product_mode FROM catalog.store_products WHERE product_id = $2::uuid AND store_id = $1`;
          convCheckParams.push(catalogGlobalProductId);
        } else if (item.barcode) {
          convCheckSql = `SELECT sp.conversion_confirmed, sp.product_mode FROM catalog.store_products sp JOIN catalog.store_product_barcodes spb ON spb.store_product_id = sp.id AND spb.store_id = sp.store_id WHERE sp.store_id = $1 AND spb.barcode = $2 LIMIT 1`;
          convCheckParams.push(item.barcode);
        }
        if (convCheckSql) {
          const convCheck = await client.query(convCheckSql, convCheckParams);
          if (convCheck.rows[0]?.product_mode === 'LOOSE_BULK' &&
              convCheck.rows[0]?.conversion_confirmed === false) {
            throw new Error("conversion_not_confirmed");
          }
        }
      }

      // T-060: Compute effective stock quantity for retail variant sales
      // For variant "500 GM" of a KG-tracked product, multiplier = 0.5
      // So selling qty 2 → stockQuantity = 2 * 0.5 = 1 KG deducted from parent
      let stockQuantity = item.quantity;
      if (item.retailVariantId) {
        const multiplier = await getRetailVariantStockMultiplier(client, item.retailVariantId, storeId);
        stockQuantity = Math.max(0.001, item.quantity * multiplier);
      }

      resolvedItems.push({
        variantId,
        quantity: item.quantity,
        stockQuantity,
        priceMinor: item.priceMinor,
        name: item.name,
        barcode: item.barcode,
        globalProductId: catalogGlobalProductId ?? item.globalProductId ?? undefined,
        batchNumber: item.batchNumber ?? null
      });
    }

    // T-060: Use stockQuantity for availability checks (converted for retail variants)
    await ensureStoreInventoryAvailability({
      client,
      storeId,
      items: resolvedItems.map((item) => ({
        variantId: item.variantId,
        quantity: item.stockQuantity,
        globalProductId: item.globalProductId ?? undefined,
        name: item.name ?? null
      }))
    });

    await ensureSaleAvailability({
      client,
      storeId,
      items: resolvedItems.map((item) => ({ variantId: item.variantId, quantity: item.stockQuantity }))
    });

    const variantRes = await client.query(
      `
      SELECT v.id, v.name, v.product_id, b.barcode AS supermandi_barcode
      FROM variants v
      LEFT JOIN barcodes b
        ON b.variant_id = v.id AND b.barcode_type = 'supermandi'
      WHERE v.id = ANY($1::text[])
      `,
      [resolvedItems.map((item) => item.variantId)]
    );

    const variantMap = new Map<string, { name: string; barcode: string | null; productId: string | null }>();
    for (const row of variantRes.rows) {
      variantMap.set(String(row.id), {
        name: String(row.name ?? ""),
        barcode: row.supermandi_barcode ? String(row.supermandi_barcode) : null,
        productId: row.product_id ? String(row.product_id) : null
      });
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const inserted = await client.query(
          `
          INSERT INTO sales (id, store_id, device_id, bill_ref, subtotal_minor, discount_minor, total_minor, status, currency, staff_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (id) DO NOTHING
          RETURNING id
          `,
          [saleId, storeId, deviceId, billRef, subtotal, discount, total, "PENDING", saleCurrency, req.header("x-staff-id")?.trim() || null]
        );
        if ((inserted.rowCount ?? 0) > 0) {
          break;
        }
        const existing = await client.query(
          `
          SELECT id, bill_ref, subtotal_minor, discount_minor, total_minor
          FROM sales
          WHERE id = $1 AND store_id = $2
          LIMIT 1
          `,
          [saleId, storeId]
        );
        const row = existing.rows[0];
        if (row) {
          await client.query("COMMIT");
          return res.json({
            saleId: String(row.id),
            billRef: String(row.bill_ref),
            totals: {
              subtotalMinor: Number(row.subtotal_minor ?? 0),
              discountMinor: Number(row.discount_minor ?? 0),
              totalMinor: Number(row.total_minor ?? 0)
            }
          });
        }
        throw new Error("sale_id_conflict");
      } catch (error) {
        billRef = buildBillRef();
        if (attempt === 2) {
          throw error;
        }
      }
    }

    for (const item of resolvedItems) {
      const fallback = variantMap.get(item.variantId);
      const itemName =
        typeof item.name === "string" && item.name.trim()
          ? item.name.trim()
          : fallback?.name
          ? fallback.name
          : `Item ${item.variantId.slice(-4)}`;
      const itemBarcode =
        typeof item.barcode === "string" && item.barcode.trim()
          ? item.barcode.trim()
          : fallback?.barcode ?? null;
      // GCP-STG-0118: Capture item-level discount from cart edits
      const itemDiscountMinor = Math.max(0, Math.round(
        item.itemDiscountMinor ?? item.itemDiscount ?? item.item_discount ?? 0
      ));
      const lineTotal = (item.priceMinor * item.quantity) - itemDiscountMinor;
      const itemProductId = fallback?.productId ?? item.globalProductId ?? item.variantId;
      // T-060: Store stock_quantity for confirm endpoint to use correct deduction
      const stockQty = item.stockQuantity !== item.quantity ? item.stockQuantity : null;
      await client.query(
        `
        INSERT INTO sale_items (id, sale_id, store_id, product_id, variant_id, quantity, price_minor, line_total_minor, discount_minor, item_name, barcode, stock_quantity, batch_number)
        VALUES ($1, $2, $3::uuid, $4::uuid, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `,
        [
          randomUUID(),
          saleId,
          storeId,
          itemProductId,
          item.variantId,
          item.quantity,
          item.priceMinor,
          lineTotal,
          itemDiscountMinor,
          itemName,
          itemBarcode,
          stockQty,
          item.batchNumber ?? null
        ]
      );
    }

    // T-060: Use stockQuantity for inventory movements (converted for retail variants)
    await recordSaleInventoryMovements({
      client,
      storeId,
      saleId,
      items: resolvedItems.map((item) => ({
        variantId: item.variantId,
        quantity: item.stockQuantity,
        unitSellMinor: item.priceMinor,
        name: item.name ?? null,
        globalProductId: item.globalProductId ?? null
      }))
    });

    // GCP-STG-0329: Stock deducted here at createSale via recordSaleInventoryMovements.
    // confirmPayment calls applyBulkDeductions for additional bulk unit conversions,
    // but guards against double-deduction by checking existing ledger entries.
    // Sale status is PENDING until payment is confirmed.
    // If payment fails, sale can be cancelled via cancelSale endpoint.

    // GCP-STG-0737: Check for low stock alerts after deduction
    try {
      for (const item of resolvedItems) {
        if (!item.globalProductId) continue;
        const stockRow = await client.query(
          `SELECT sb.current_qty, sp.low_stock_alert_qty, sp.display_name
           FROM inventory.stock_balances sb
           JOIN catalog.store_products sp ON sp.product_id = sb.product_id AND sp.store_id = sb.store_id
           WHERE sb.store_id = $1 AND sb.product_id = $2
           LIMIT 1`,
          [storeId, item.globalProductId]
        );
        if (stockRow.rows[0]) {
          const { current_qty, low_stock_alert_qty, display_name } = stockRow.rows[0];
          const qty = Number(current_qty) || 0;
          const threshold = Number(low_stock_alert_qty) || 0;
          if (threshold > 0 && qty < threshold) {
            // Insert alert, skip duplicate (unread alert for same product)
            await client.query(
              `INSERT INTO platform.store_alerts (store_id, alert_type, product_id, title, message)
               SELECT $1, 'LOW_STOCK', $2::uuid, $3, $4
               WHERE NOT EXISTS (
                 SELECT 1 FROM platform.store_alerts
                 WHERE store_id = $1 AND product_id = $2::uuid AND alert_type = 'LOW_STOCK' AND is_read = false
               )`,
              [storeId, item.globalProductId, `Low stock: ${display_name || item.name || 'Unknown'}`, `Stock is ${qty}, below threshold of ${threshold}`]
            );
          }
        }
      }
    } catch (alertErr) {
      // Non-critical: log but don't fail the sale
      log.warn("[GCP-STG-0737] Low stock alert check failed:", alertErr);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if (error instanceof InsufficientStockError) {
      const message =
        error.details.length === 1
          ? error.details[0].message
          : "Stock changed.";
      return res.status(409).json({
        error: "insufficient_stock",
        message,
        details: error.details
      });
    }
    // T-177: Handle optimistic concurrency conflict on stock_balances
    if (error instanceof StockVersionConflictError) {
      return res.status(409).json({
        error: "stock_version_conflict",
        message: "Stock changed, please refresh"
      });
    }
    if (error instanceof Error && error.message === "insufficient_stock") {
      return res.status(409).json({
        error: "insufficient_stock",
        message: "Stock changed."
      });
    }
    if (error instanceof Error && error.message === "product_not_found") {
      return res.status(404).json({ error: "product_not_found" });
    }
    // V3-HARDEN-171: Block sale of unconverted bulk products
    if (error instanceof Error && error.message === "conversion_not_confirmed") {
      return res.status(422).json({
        error: "conversion_not_confirmed",
        message: "Retail conversion setup required before selling this product. Complete setup in Products → Variants.",
      });
    }
    if (error instanceof Error && error.message === "sale_id_conflict") {
      return res.status(409).json({ error: "sale_id_conflict" });
    }
    // DATA-005: Server-side retry for SERIALIZABLE transaction conflicts
    if ((error as any)?.code === "40001") {
      if (serializationAttempt < MAX_SERIALIZATION_RETRIES) {
        serializationRetryDelay = (serializationAttempt + 1) * 50; // 50ms, 100ms, 150ms backoff
        log.warn(`[POS/sales] Serialization conflict, attempt ${serializationAttempt + 1}/${MAX_SERIALIZATION_RETRIES} — retrying in ${serializationRetryDelay}ms`);
        continue; // finally releases client, loop retries with backoff
      }
      log.warn("[POS/sales] Serialization conflict — all retries exhausted:", (error as Error).message);
      return res.status(409).json({
        error: "serialization_conflict",
        message: "Transaction conflict after retries — please retry",
        retryable: true
      });
    }
    log.error("[POS/sales] Unhandled sale creation error:", error instanceof Error ? error.message : error, error instanceof Error ? error.stack : "");
    return res.status(500).json({ error: "failed to create sale" });
  } finally {
    client.release();
  }

  return res.json({
    saleId,
    billRef,
    totals: {
      subtotalMinor: subtotal,
      discountMinor: discount,
      totalMinor: total,
    }
  });

  } // end DATA-005 serialization retry loop
  // Should not reach here — all paths return inside the loop
  return res.status(500).json({ error: "failed to create sale" });
});

// Confirm payment and deduct stock (two-phase commit)
// This endpoint is called AFTER payment is confirmed
// Stock is only deducted when payment is successful
// GO-LIVE-184: Rate limit payment confirmations to 30/min per store
// SEC-001: POST /sales/:saleId/confirm requires ACTIVE store status
posSalesRouter.post("/sales/:saleId/confirm", requireDeviceToken, requireActiveStore, financialOperationsRateLimiter, async (req, res) => {
  const saleId = typeof req.params.saleId === "string" ? req.params.saleId.trim() : "";
  if (!saleId) {
    return res.status(400).json({ error: "saleId is required" });
  }

  // GCP-STG-0656: Accept idempotencyKey from frontend for double-payment prevention
  const { paymentMode, idempotencyKey } = req.body as { paymentMode?: "CASH" | "UPI" | "DUE"; idempotencyKey?: string };
  if (!paymentMode || !["CASH", "UPI", "DUE"].includes(paymentMode)) {
    return res.status(400).json({ error: "paymentMode is required (CASH, UPI, or DUE)" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromPosDevice(req, "pos/sales");

  // GCP-STG-0656: Idempotency check — if key provided, check for existing payment
  if (typeof idempotencyKey === "string" && idempotencyKey.trim()) {
    const existing = await pool.query(
      `SELECT p.id, p.mode, p.status, p.amount_minor FROM payments p
       WHERE p.sale_id = $1 AND p.store_id = $2
       AND p.created_at > NOW() - INTERVAL '5 minutes'
       LIMIT 1`,
      [saleId, storeId]
    );
    if (existing.rows[0]) {
      return res.json({
        saleId,
        status: existing.rows[0].status,
        message: "Payment already processed (idempotent)",
        idempotent: true,
      });
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    // GCP-STG-0084 FIX: Set RLS store context for defense-in-depth
    await client.query("SELECT set_config('app.current_store_id', $1::text, true)", [storeId]);

    // SA-P1-006: Check store-level payment method restrictions
    const apmRes = await client.query(
      `SELECT allowed_payment_methods FROM platform.stores WHERE id = $1::uuid`,
      [storeId]
    );
    const allowedMethods: string[] = apmRes.rows[0]?.allowed_payment_methods ?? ['CASH', 'UPI', 'DUE'];
    if (!allowedMethods.includes(paymentMode)) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        error: "payment_method_not_allowed",
        message: `${paymentMode} is not enabled for this store`,
        allowedMethods
      });
    }

    // AUD-060-D FIX: Get sale WITH ROW LOCK to prevent cancel+confirm race
    const saleRes = await client.query(
      `
      SELECT id, store_id, status, subtotal_minor, discount_minor, total_minor, customer_name, customer_phone, created_at
      FROM sales
      WHERE id = $1 AND store_id = $2
      FOR UPDATE
      `,
      [saleId, storeId]
    );

    const sale = saleRes.rows[0];
    if (!sale) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "sale_not_found" });
    }

    if (sale.status !== "PENDING") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "sale_already_confirmed",
        message: `Sale is in ${sale.status} status and cannot be confirmed again`
      });
    }

    // GO-LIVE-042: Check reservation expiry
    if (isSaleReservationExpired(sale.created_at)) {
      // LIVE.BE.STORE_ISOLATION: Add store_id to WHERE clause
      await client.query(`UPDATE sales SET status = 'EXPIRED' WHERE id = $1 AND store_id = $2`, [saleId, storeId]);
      await client.query("COMMIT");
      return res.status(410).json({
        error: "sale_reservation_expired",
        message: "Sale reservation has expired (30 minutes). Please create a new sale."
      });
    }

    // Get sale items
    // T-060: Include stock_quantity for retail variant deduction
    const itemsRes = await client.query(
      `
      SELECT variant_id, quantity, stock_quantity
      FROM sale_items
      WHERE sale_id = $1
      `,
      [saleId]
    );

    const items = itemsRes.rows.map((row) => {
      const billingQty = Number(row.quantity ?? 0);
      // T-060: Use stock_quantity if present (retail variant), otherwise billing quantity
      const stockQty = row.stock_quantity != null ? Number(row.stock_quantity) : billingQty;
      return {
        variantId: String(row.variant_id),
        quantity: Number.isFinite(stockQty) && stockQty > 0 ? stockQty : billingQty
      };
    });

    // GO-LIVE-117: Re-verify stock availability - CRITICAL for overselling prevention
    // Stock is NOT reserved during PENDING state - another sale could consume it
    // This final check ensures we don't oversell even with concurrent pending sales
    // If this fails, payment is rejected with InsufficientStockError
    await ensureStoreInventoryAvailability({
      client,
      storeId,
      items: items.map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
        globalProductId: null,
        name: null
      }))
    });

    // Deduct stock NOW (only after payment is confirmed and stock verified)
    // GCP-STG-0329: Pass saleId so applyBulkDeductions skips already-deducted products
    await applyBulkDeductions({
      client,
      storeId,
      items,
      saleId
    });

    // DATA-004: Validate customer_phone for DUE payments — unrecoverable without it
    if (paymentMode === "DUE" && !sale.customer_phone) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "customer_phone_required",
        message: "Customer phone is required for DUE payments"
      });
    }

    // SA-P1-003: Due limit enforcement — reject if outstanding dues would exceed store limit
    if (paymentMode === "DUE") {
      const dueLimitRes = await client.query(
        `SELECT max_outstanding_dues_paise FROM platform.stores WHERE id = $1::uuid`,
        [storeId]
      );
      const maxDuesPaise = dueLimitRes.rows[0]?.max_outstanding_dues_paise;
      if (maxDuesPaise != null) {
        const currentDuesRes = await client.query(
          `SELECT COALESCE(SUM(amount_minor), 0)::BIGINT as total FROM payments.customer_dues WHERE store_id = $1 AND status = 'pending'`,
          [storeId]
        );
        const currentPaise = Number(currentDuesRes.rows[0]?.total ?? 0);
        const newTotal = currentPaise + Number(sale.total_minor);
        if (newTotal > Number(maxDuesPaise)) {
          await client.query("ROLLBACK");
          return res.status(422).json({
            error: "DUE_LIMIT_EXCEEDED",
            currentPaise,
            limitPaise: Number(maxDuesPaise),
          });
        }
      }
    }

    // GO-LIVE-069: Update sale status and payment_status based on payment mode
    const newStatus = paymentMode === "CASH" ? "PAID_CASH" : paymentMode === "UPI" ? "PAID_UPI" : "DUE";
    const newPaymentStatus = paymentMode === "DUE" ? "due" : "paid";
    await client.query(
      // LIVE.BE.STORE_ISOLATION: Add store_id to WHERE clause
      `UPDATE sales SET status = $1, payment_status = $2 WHERE id = $3 AND store_id = $4`,
      [newStatus, newPaymentStatus, saleId, storeId]
    );

    // GO-LIVE-070: Create AR record if payment mode is DUE
    if (paymentMode === "DUE") {
      await client.query(
        `INSERT INTO accounts_receivable (store_id, sale_id, amount_minor, currency, status)
         VALUES ($1, $2, $3, 'INR', 'outstanding')
         ON CONFLICT (sale_id) DO UPDATE SET
           amount_minor = EXCLUDED.amount_minor,
           updated_at = NOW()`,
        [storeId, saleId, sale.total_minor]
      );

      // POS-DUE-002: Auto-create customer_dues record for due tracking
      await client.query(
        `INSERT INTO payments.customer_dues (store_id, sale_id, customer_name, customer_phone, amount_minor, status)
         VALUES ($1, $2, $3, $4, $5, 'pending')
         ON CONFLICT DO NOTHING`,
        [storeId, saleId, sale.customer_name || null, sale.customer_phone || null, sale.total_minor]
      );
    }

    await client.query("COMMIT");

    // GCP-STG-0077: Fire-and-forget invoice generation after successful payment confirmation
    generateSaleInvoice(pool, saleId, storeId, paymentMode).catch(() => {});
    // GCP-STG-0233: Log SALE_COMPLETED event for admin Events tab
    // GCP-STG-0655: Use sale.total_minor (server-derived) instead of undefined totalAmount
    void logPosEventSafe({ deviceId: (req as any).deviceId ?? "backend", storeId, eventType: "SALE_COMPLETED", payload: { saleId, paymentMode, totalMinor: Number(sale.total_minor) } });
    // GCP-STG-0382: Fire-and-forget payment_completed lifecycle event
    void publishLifecycleEvent({
      eventType: "payment_completed",
      orderId: saleId,
      storeId,
      supplierId: null,
      targets: [{ role: "retailer", channels: ["in_app", "whatsapp"] }],
      payload: { saleId, method: paymentMode, totalMinor: Number(sale.total_minor) },
      timestamp: new Date().toISOString(),
    }).catch(() => {});

    return res.json({
      saleId,
      status: newStatus,
      message: "Payment confirmed and stock deducted"
    });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error instanceof InsufficientStockError) {
      const message =
        error.details.length === 1
          ? error.details[0].message
          : "Stock changed since sale was created.";
      return res.status(409).json({
        error: "insufficient_stock",
        message,
        details: error.details
      });
    }
    // T-177: Handle optimistic concurrency conflict on stock_balances
    if (error instanceof StockVersionConflictError) {
      return res.status(409).json({
        error: "stock_version_conflict",
        message: "Stock changed, please refresh"
      });
    }
    return res.status(500).json({ error: "failed to confirm payment" });
  } finally {
    client.release();
  }
});

// Cancel a pending sale (cleanup abandoned carts)
// This endpoint restocks items if needed
// SEC-001: POST /sales/:saleId/cancel requires ACTIVE store status
posSalesRouter.post("/sales/:saleId/cancel", requireDeviceToken, requireActiveStore, async (req, res) => {
  const saleId = typeof req.params.saleId === "string" ? req.params.saleId.trim() : "";
  if (!saleId) {
    return res.status(400).json({ error: "saleId is required" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromPosDevice(req, "pos/sales");

  const client = await pool.connect();
  try {
    // AUD-060-D FIX: Use SERIALIZABLE isolation + FOR UPDATE to prevent cancel+pay race
    await client.query("BEGIN");
    await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    // GCP-STG-0084 FIX: Set RLS store context for defense-in-depth
    await client.query("SELECT set_config('app.current_store_id', $1::text, true)", [storeId]);

    // Get sale and verify it exists WITH ROW LOCK
    // AUD-060-D FIX: FOR UPDATE prevents concurrent payment from proceeding
    const saleRes = await client.query(
      `
      SELECT id, store_id, status
      FROM sales
      WHERE id = $1 AND store_id = $2
      FOR UPDATE
      `,
      [saleId, storeId]
    );

    const sale = saleRes.rows[0];
    if (!sale) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "sale_not_found" });
    }

    // Only allow cancelling PENDING sales
    if (sale.status !== "PENDING") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "cannot_cancel",
        message: `Cannot cancel sale in ${sale.status} status`
      });
    }

    // Update status to CANCELLED
    await client.query(
      // LIVE.BE.STORE_ISOLATION: Add store_id to WHERE clause
      `UPDATE sales SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1 AND store_id = $2`,
      [saleId, storeId]
    );

    await client.query("COMMIT");

    return res.json({
      saleId,
      status: "CANCELLED",
      message: "Sale cancelled successfully"
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ error: "failed to cancel sale" });
  } finally {
    client.release();
  }
});

// =============================================================================
// GO-LIVE-066/067: Sale Return/Refund endpoint
// Reverses ledger entries and adds stock back for completed sales
// =============================================================================
// SEC-001: POST /sales/:saleId/return requires ACTIVE store status
posSalesRouter.post("/sales/:saleId/return", requireDeviceToken, requireActiveStore, async (req, res) => {
  const saleId = typeof req.params.saleId === "string" ? req.params.saleId.trim() : "";
  if (!saleId) {
    return res.status(400).json({ error: "saleId is required" });
  }

  const { reason } = req.body as { reason?: string };

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromPosDevice(req, "pos/sales");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    // GCP-STG-0084 FIX: Set RLS store context for defense-in-depth
    await client.query("SELECT set_config('app.current_store_id', $1::text, true)", [storeId]);

    // Get sale with lock
    const saleRes = await client.query(
      `SELECT id, store_id, status, payment_status, total_minor
       FROM sales WHERE id = $1 AND store_id = $2
       FOR UPDATE`,
      [saleId, storeId]
    );

    const sale = saleRes.rows[0];
    if (!sale) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "sale_not_found" });
    }

    // Only allow returning completed sales (PAID_CASH, PAID_UPI, DUE)
    const allowedStatuses = ["PAID_CASH", "PAID_UPI", "DUE"];
    if (!allowedStatuses.includes(sale.status)) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "cannot_return",
        message: `Cannot return sale in ${sale.status} status. Only paid or due sales can be returned.`
      });
    }

    // Get sale items
    // T-060: Include stock_quantity for retail variant stock reversal
    const itemsRes = await client.query(
      `SELECT si.variant_id, si.quantity, si.stock_quantity, si.price_minor, v.product_id
       FROM sale_items si
       LEFT JOIN variants v ON v.id = si.variant_id
       WHERE si.sale_id = $1`,
      [saleId]
    );

    const items = itemsRes.rows.map((row) => {
      const billingQty = Number(row.quantity ?? 0);
      // T-060: Use stock_quantity if present (retail variant), otherwise billing quantity
      const stockQty = row.stock_quantity != null ? Number(row.stock_quantity) : billingQty;
      return {
        variantId: String(row.variant_id),
        quantity: Number.isFinite(stockQty) && stockQty > 0 ? stockQty : billingQty,
        unitSellMinor: Number(row.price_minor ?? 0),
        globalProductId: row.product_id ? String(row.product_id) : null,
        name: null
      };
    });

    // Generate return ID
    const returnId = randomUUID();

    // GO-LIVE-066/067: Create sale_return ledger entries (adds stock back)
    await recordSaleReturnMovements({
      client,
      storeId,
      saleId,
      returnId,
      items,
      reason: reason ?? "Sale return"
    });

    // GO-LIVE-034: Invalidate stock cache for all returned products
    for (const item of items) {
      if (item.globalProductId) {
        invalidateStockCache(storeId, item.globalProductId);
      }
    }

    // Update sale status to REFUNDED
    await client.query(
      // LIVE.BE.STORE_ISOLATION: Add store_id to WHERE clause
      `UPDATE sales SET status = 'REFUNDED', payment_status = 'refunded', updated_at = NOW()
       WHERE id = $1 AND store_id = $2`,
      [saleId, storeId]
    );

    // Update AR record if it exists (for DUE sales)
    if (sale.status === "DUE") {
      await client.query(
        // LIVE.BE.STORE_ISOLATION: Add store_id to WHERE clause
        `UPDATE accounts_receivable SET status = 'written_off', notes = $2, updated_at = NOW()
         WHERE sale_id = $1 AND store_id = $3`,
        [saleId, reason ?? "Sale returned", storeId]
      );
    }

    await client.query("COMMIT");

    return res.json({
      saleId,
      returnId,
      status: "REFUNDED",
      message: "Sale returned successfully. Stock has been restored.",
      itemsReturned: items.length
    });
  } catch (error) {
    await client.query("ROLLBACK");
    log.error("[sales/return] Error:", error);
    return res.status(500).json({ error: "failed to process return" });
  } finally {
    client.release();
  }
});

// =============================================================================
// GCP-STG-0734: Item-level sale return with 7-day window + refund type
// Partial returns: specify which items and quantities to return
// =============================================================================
const RETURN_WINDOW_DAYS = parseInt(process.env.RETURN_WINDOW_DAYS || '7', 10);

posSalesRouter.post("/sales/:saleId/item-return", requireDeviceToken, requireActiveStore, async (req, res) => {
  const saleId = typeof req.params.saleId === "string" ? req.params.saleId.trim() : "";
  if (!saleId) return res.status(400).json({ error: "saleId is required" });

  const { items, refundType } = req.body as {
    items?: { productId: string; qty: number; reason?: string }[];
    refundType?: "CASH" | "STORE_CREDIT";
  };

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "items array is required and must not be empty" });
  }

  const validRefundType = refundType === "STORE_CREDIT" ? "STORE_CREDIT" : "CASH";

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromPosDevice(req, "pos/sales/item-return");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    await client.query("SELECT set_config('app.current_store_id', $1::text, true)", [storeId]);

    // Get sale with lock
    const saleRes = await client.query(
      `SELECT id, store_id, status, total_minor, created_at
       FROM sales WHERE id = $1 AND store_id = $2 FOR UPDATE`,
      [saleId, storeId]
    );

    const sale = saleRes.rows[0];
    if (!sale) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "sale_not_found" });
    }

    // 7-day return window
    const saleAge = Date.now() - new Date(sale.created_at).getTime();
    if (saleAge > RETURN_WINDOW_DAYS * 86400000) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "return_window_expired", message: `Returns are only allowed within ${RETURN_WINDOW_DAYS} days of purchase` });
    }

    // Only completed sales
    const allowed = ["PAID_CASH", "PAID_UPI", "DUE", "SPLIT", "completed"];
    if (!allowed.includes(sale.status)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "cannot_return", message: `Cannot return sale in ${sale.status} status` });
    }

    // Get original sale items
    const origItemsRes = await client.query(
      `SELECT si.id, si.variant_id, si.quantity, si.stock_quantity, si.price_minor, si.name, v.product_id
       FROM sale_items si
       LEFT JOIN variants v ON v.id = si.variant_id
       WHERE si.sale_id = $1`,
      [saleId]
    );
    const origMap = new Map(origItemsRes.rows.map((r: any) => [String(r.product_id ?? r.variant_id), r]));

    // Validate return items against original sale
    let totalRefundMinor = 0;
    const returnItems: { variantId: string; quantity: number; unitSellMinor: number; globalProductId: string | null; name: string | null; reason: string }[] = [];

    for (const item of items) {
      if (!item.productId || typeof item.qty !== "number" || item.qty <= 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "invalid_item", message: "Each item needs productId and qty > 0" });
      }

      const orig = origMap.get(item.productId);
      if (!orig) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "item_not_in_sale", message: `Product ${item.productId} was not in this sale` });
      }

      const origQty = Number(orig.quantity ?? 0);
      if (item.qty > origQty) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "qty_exceeds_original", message: `Return qty ${item.qty} exceeds original qty ${origQty}` });
      }

      const unitPrice = Number(orig.price_minor ?? 0);
      totalRefundMinor += Math.round(unitPrice * item.qty);

      returnItems.push({
        variantId: String(orig.variant_id),
        quantity: item.qty,
        unitSellMinor: unitPrice,
        globalProductId: orig.product_id ? String(orig.product_id) : null,
        name: orig.name ?? null,
        reason: item.reason ?? "Customer return",
      });
    }

    // Generate return record
    const returnId = randomUUID();
    const returnRef = `RTN-${Date.now().toString(36).toUpperCase()}`;

    // Record in orders.sale_returns
    try {
      await client.query(
        `INSERT INTO orders.sale_returns (id, store_id, sale_id, return_ref, items, refund_type, total_refund_minor, reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [returnId, storeId, saleId, returnRef, JSON.stringify(returnItems.map(ri => ({
          productId: ri.globalProductId,
          variantId: ri.variantId,
          qty: ri.quantity,
          refundMinor: Math.round(ri.unitSellMinor * ri.quantity),
          reason: ri.reason,
        }))), validRefundType, totalRefundMinor, returnItems.map(ri => ri.reason).join("; ")]
      );
    } catch (e: any) {
      // Graceful if orders.sale_returns table not yet applied
      if (e.code !== "42P01") throw e;
      log.warn("[item-return] orders.sale_returns table not found, skipping record");
    }

    // Reverse stock via ledger
    await recordSaleReturnMovements({
      client,
      storeId,
      saleId,
      returnId,
      items: returnItems,
      reason: `Item return: ${returnRef}`,
    });

    // Invalidate stock cache
    for (const ri of returnItems) {
      if (ri.globalProductId) invalidateStockCache(storeId, ri.globalProductId);
    }

    // If all items returned, mark sale as REFUNDED; otherwise keep original status
    const totalOrigQty = origItemsRes.rows.reduce((sum: number, r: any) => sum + Number(r.quantity ?? 0), 0);
    const totalReturnQty = returnItems.reduce((sum, r) => sum + r.quantity, 0);
    if (totalReturnQty >= totalOrigQty) {
      await client.query(
        `UPDATE sales SET status = 'REFUNDED', payment_status = 'refunded', updated_at = NOW()
         WHERE id = $1 AND store_id = $2`,
        [saleId, storeId]
      );
    }

    await client.query("COMMIT");

    return res.json({
      saleId,
      returnId,
      returnRef,
      refundType: validRefundType,
      totalRefundMinor,
      itemsReturned: returnItems.length,
      message: "Return processed successfully. Stock has been restored.",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    log.error("[sales/item-return] Error:", error);
    return res.status(500).json({ error: "failed to process return" });
  } finally {
    client.release();
  }
});

// =============================================================================
// GCP-STG-0657: Configurable refund time limit
// =============================================================================
const REFUND_MAX_DAYS = parseInt(process.env.REFUND_MAX_DAYS || '7', 10);

// =============================================================================
// STG-489: Void/refund a completed sale
// Sets status to 'voided', records who voided it and when.
// Only completed sales (PAID_CASH, PAID_UPI, DUE) can be voided.
// =============================================================================
// SEC-001: POST /sales/:saleId/void requires ACTIVE store status
posSalesRouter.post("/sales/:saleId/void", requireDeviceToken, requireActiveStore, financialOperationsRateLimiter, async (req, res) => {
  const saleId = typeof req.params.saleId === "string" ? req.params.saleId.trim() : "";
  if (!saleId) {
    return res.status(400).json({ error: "saleId is required" });
  }

  const { reason } = req.body as { reason?: string };

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId, deviceId } = getDeviceContextFromPosDevice(req, "pos/sales");
  // STG-489: Staff ID from header (set by POS app on staff login)
  const staffId = req.header("x-staff-id")?.trim() || null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    // GCP-STG-0084 FIX: Set RLS store context for defense-in-depth
    await client.query("SELECT set_config('app.current_store_id', $1::text, true)", [storeId]);

    // 1. Get sale with row lock — store isolation via JWT storeId
    const saleRes = await client.query(
      `SELECT id, store_id, status, payment_status, total_minor, bill_ref,
              customer_name, customer_phone, staff_id, device_id, created_at, updated_at
       FROM sales
       WHERE id = $1 AND store_id = $2
       FOR UPDATE`,
      [saleId, storeId]
    );

    const sale = saleRes.rows[0];
    if (!sale) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "sale_not_found" });
    }

    // 2. Only completed sales can be voided (PAID_CASH, PAID_UPI, DUE)
    const voidableStatuses = ["PAID_CASH", "PAID_UPI", "DUE"];
    if (!voidableStatuses.includes(sale.status)) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "cannot_void",
        message: `Cannot void sale in ${sale.status} status. Only completed sales (${voidableStatuses.join(", ")}) can be voided.`
      });
    }

    // GCP-STG-0657: Enforce configurable refund time window
    const saleDateMs = new Date(sale.created_at).getTime();
    const daysSinceSale = (Date.now() - saleDateMs) / (1000 * 60 * 60 * 24);
    if (daysSinceSale > REFUND_MAX_DAYS) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: { code: 'REFUND_WINDOW_EXPIRED', message: `Refund window expired. Maximum ${REFUND_MAX_DAYS} days.` }
      });
    }

    // 3. Get sale items for stock reversal
    // T-060: Include stock_quantity for retail variant stock reversal
    const itemsRes = await client.query(
      `SELECT si.variant_id, si.quantity, si.stock_quantity, si.price_minor, v.product_id
       FROM sale_items si
       LEFT JOIN variants v ON v.id = si.variant_id
       WHERE si.sale_id = $1`,
      [saleId]
    );

    const items = itemsRes.rows.map((row) => {
      const billingQty = Number(row.quantity ?? 0);
      // T-060: Use stock_quantity if present (retail variant), otherwise billing quantity
      const stockQty = row.stock_quantity != null ? Number(row.stock_quantity) : billingQty;
      return {
        variantId: String(row.variant_id),
        quantity: Number.isFinite(stockQty) && stockQty > 0 ? stockQty : billingQty,
        unitSellMinor: Number(row.price_minor ?? 0),
        globalProductId: row.product_id ? String(row.product_id) : null,
        name: null
      };
    });

    // 4. Reverse stock via inventory ledger (add stock back)
    const voidId = randomUUID();
    await recordSaleReturnMovements({
      client,
      storeId,
      saleId,
      returnId: voidId,
      items,
      reason: reason ?? "Sale voided"
    });

    // 5. Invalidate stock cache for all voided products
    for (const item of items) {
      if (item.globalProductId) {
        invalidateStockCache(storeId, item.globalProductId);
      }
    }

    // 6. Update sale status to 'voided' (lowercase per DB constraint chk_sale_status)
    // Record who voided it and when via updated_at
    await client.query(
      `UPDATE sales
       SET status = 'voided',
           payment_status = 'refunded',
           updated_at = NOW()
       WHERE id = $1 AND store_id = $2`,
      [saleId, storeId]
    );

    // 7. Write off AR record if sale was DUE
    if (sale.status === "DUE") {
      await client.query(
        `UPDATE accounts_receivable
         SET status = 'written_off', notes = $2, updated_at = NOW()
         WHERE sale_id = $1 AND store_id = $3`,
        [saleId, reason ?? "Sale voided", storeId]
      );
    }

    await client.query("COMMIT");

    log.info(`[STG-489] Sale voided: saleId=${saleId}, storeId=${storeId}, staffId=${staffId}, deviceId=${deviceId}, reason=${reason ?? "none"}`);

    return res.json({
      saleId,
      voidId,
      status: "voided",
      message: "Sale voided successfully. Stock has been restored.",
      voidedBy: staffId,
      voidedAt: new Date().toISOString(),
      itemsReturned: items.length
    });
  } catch (error) {
    await client.query("ROLLBACK");
    log.error("[STG-489] Sale void error:", error);
    return res.status(500).json({ error: "failed to void sale" });
  } finally {
    client.release();
  }
});

// IMPORTANT:
// UPI intent / QR must NEVER be generated on backend.
// POS generates intent locally using upiVpa.
// Do not add payment gateway logic here.
// SEC-001: POST /payments/upi/init requires ACTIVE store status
posSalesRouter.post("/payments/upi/init", requireDeviceToken, requireActiveStore, async (req, res) => {
  const { saleId, transactionId, upiIntent } = req.body as {
    saleId?: string;
    transactionId?: string;
    upiIntent?: string;
  };

  if (typeof saleId !== "string" || saleId.trim().length === 0) {
    return res.status(400).json({ error: "saleId is required" });
  }
  if (typeof upiIntent === "string" && upiIntent.trim().length > 0) {
    return res.status(400).json({ error: "upi_intent_not_allowed" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId, deviceId } = getDeviceContextFromPosDevice(req, "pos/sales");
  const store = await getStore(storeId);
  if (!store) {
    return res.status(404).json({ error: "store not found" });
  }

  if (!store.active) {
    return res.status(403).json({ error: "store_inactive" });
  }

  if (!store.upi_vpa) {
    return res.status(400).json({ error: "upi_vpa_missing" });
  }

  const sale = await getSale(storeId, saleId);
  if (!sale || sale.store_id !== storeId) {
    return res.status(404).json({ error: "sale not found" });
  }

  const providerRef =
    typeof transactionId === "string" && transactionId.trim().length > 0
      ? transactionId.trim()
      : null;

  const paymentId = randomUUID();
  await pool.query(
    `
    INSERT INTO payments (id, sale_id, store_id, mode, status, amount_minor, provider_ref)
    VALUES ($1, $2, $3::uuid, $4, $5, $6, $7)
    `,
    [paymentId, saleId, storeId, "UPI", "PENDING", sale.total_minor, providerRef]
  );

  return res.json({
    paymentId,
    saleId,
    billRef: sale.bill_ref,
    amountMinor: sale.total_minor,
    storeName: store.name,
    upiVpa: store.upi_vpa
  });
});

// GO-LIVE-037: UPI confirmation with idempotency
// If payment is already confirmed, return success without re-processing
// GO-LIVE-184: Rate limit payment confirmations to 30/min per store
// SEC-001: POST /payments/upi/confirm-manual requires ACTIVE store status
posSalesRouter.post("/payments/upi/confirm-manual", requireDeviceToken, requireActiveStore, financialOperationsRateLimiter, async (req, res) => {
  const { paymentId } = req.body as { paymentId?: string };

  if (typeof paymentId !== "string" || paymentId.trim().length === 0) {
    return res.status(400).json({ error: "paymentId is required" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId, deviceId } = getDeviceContextFromPosDevice(req, "pos/sales");
  const paymentStatus = await getPaymentStoreStatus(storeId, paymentId);
  if (!paymentStatus) {
    return res.status(404).json({ error: "payment not found" });
  }
  if (paymentStatus.store_id !== storeId) {
    return res.status(404).json({ error: "payment not found" });
  }
  if (!paymentStatus.active) {
    return res.status(403).json({ error: "store_inactive" });
  }

  // Use transaction to ensure atomicity: payment + stock deduction + status update
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    // GCP-STG-0084 FIX: Set RLS store context for defense-in-depth
    await client.query("SELECT set_config('app.current_store_id', $1::text, true)", [storeId]);

    const paymentRes = await client.query(
      `
      SELECT id, sale_id, status
      FROM payments
      WHERE id = $1
      FOR UPDATE
      `,
      [paymentId]
    );

    const payment = paymentRes.rows[0];
    if (!payment) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "payment not found" });
    }

    // GO-LIVE-037: Idempotency - if already confirmed, return success
    if (payment.status === "PAID") {
      await client.query("ROLLBACK");
      return res.json({ status: "PAID", idempotent: true });
    }

    const saleId = String(payment.sale_id);

    // AUD-060-D FIX: Get sale WITH ROW LOCK to prevent cancel+payment race
    const saleRes = await client.query(
      `
      SELECT id, store_id, status, total_minor, created_at
      FROM sales
      WHERE id = $1 AND store_id = $2
      FOR UPDATE
      `,
      [saleId, storeId]
    );

    const sale = saleRes.rows[0];
    if (!sale) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "sale not found" });
    }

    if (sale.status !== "PENDING") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "sale_not_pending",
        message: `Sale is in ${sale.status} status and cannot accept payment`
      });
    }

    // GO-LIVE-042: Check reservation expiry
    if (isSaleReservationExpired(sale.created_at)) {
      // LIVE.BE.STORE_ISOLATION: Add store_id to WHERE clause
      await client.query(`UPDATE sales SET status = 'EXPIRED' WHERE id = $1 AND store_id = $2`, [saleId, storeId]);
      await client.query("COMMIT");
      return res.status(410).json({
        error: "sale_reservation_expired",
        message: "Sale reservation has expired (30 minutes). Please create a new sale."
      });
    }

    // Get sale items for stock deduction
    // STG-100: Include stock_quantity for retail variant deduction (same as confirm endpoint)
    const itemsRes = await client.query(
      `
      SELECT variant_id, quantity, stock_quantity
      FROM sale_items
      WHERE sale_id = $1
      `,
      [saleId]
    );

    const items = itemsRes.rows.map((row) => {
      const billingQty = Number(row.quantity ?? 0);
      // STG-100: Use stock_quantity if present (retail variant), otherwise billing quantity
      const stockQty = row.stock_quantity != null ? Number(row.stock_quantity) : billingQty;
      return {
        variantId: String(row.variant_id),
        quantity: Number.isFinite(stockQty) && stockQty > 0 ? stockQty : billingQty
      };
    });

    // GO-LIVE-117: Re-verify stock availability - CRITICAL for overselling prevention
    // Stock is NOT reserved during PENDING state - another sale could consume it
    // This final check ensures we don't oversell even with concurrent pending sales
    // If this fails, payment is rejected with InsufficientStockError
    await ensureStoreInventoryAvailability({
      client,
      storeId,
      items: items.map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
        globalProductId: null,
        name: null
      }))
    });

    // Deduct stock NOW (only after payment is confirmed and stock verified)
    // GCP-STG-0329: Pass saleId so applyBulkDeductions skips already-deducted products
    await applyBulkDeductions({
      client,
      storeId,
      items,
      saleId
    });

    // Update payment status
    await client.query(
      `
      UPDATE payments
      SET status = 'PAID', confirmed_at = NOW()
      WHERE id = $1
      `,
      [paymentId]
    );

    // GO-LIVE-069: Update both status and payment_status
    await client.query(
      // LIVE.BE.STORE_ISOLATION: Add store_id to WHERE clause
      `UPDATE sales SET status = 'PAID_UPI', payment_status = 'paid' WHERE id = $1 AND store_id = $2`,
      [saleId, storeId]
    );

    await client.query("COMMIT");

    // GCP-STG-0077: Fire-and-forget invoice generation after successful UPI payment
    generateSaleInvoice(pool, saleId, storeId, "UPI").catch(() => {});
    void logPosEventSafe({ deviceId: (req as any).deviceId ?? "backend", storeId, eventType: "PAYMENT_COMPLETED", payload: { saleId, method: "UPI" } });
    // GCP-STG-0382: Fire-and-forget payment_completed lifecycle event (UPI)
    void publishLifecycleEvent({
      eventType: "payment_completed",
      orderId: saleId,
      storeId,
      supplierId: null,
      targets: [{ role: "retailer", channels: ["in_app", "whatsapp"] }],
      payload: { saleId, method: "UPI" },
      timestamp: new Date().toISOString(),
    }).catch(() => {});

    return res.json({ status: "PAID" });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error instanceof InsufficientStockError) {
      const message =
        error.details.length === 1
          ? error.details[0].message
          : "Stock changed since sale was created.";
      return res.status(409).json({
        error: "insufficient_stock",
        message,
        details: error.details
      });
    }
    // T-177: Handle optimistic concurrency conflict on stock_balances
    if (error instanceof StockVersionConflictError) {
      return res.status(409).json({
        error: "stock_version_conflict",
        message: "Stock changed, please refresh"
      });
    }
    return res.status(500).json({ error: "failed to confirm payment" });
  } finally {
    client.release();
  }
});

// =============================================================================
// GCP-STG-0077: Auto-generate tax invoice after POS sale completion
// Fire-and-forget — never blocks payment response. Logs errors, never throws.
// =============================================================================
async function generateSaleInvoice(
  pool: Pool,
  saleId: string,
  storeId: string,
  paymentMode: "CASH" | "UPI" | "DUE"
): Promise<string | null> {
  try {
    // 1. Check if invoice already exists for this sale (idempotency)
    const existing = await pool.query(
      `SELECT id FROM invoicing.invoices WHERE order_id = $1 LIMIT 1`,
      [saleId]
    );
    if (existing.rows.length > 0) {
      return String(existing.rows[0].id);
    }

    // 2. Fetch store details (seller)
    const storeRes = await pool.query(
      `SELECT name, gstin, address_line1, address_line2, city, state
       FROM platform.stores WHERE id = $1::uuid`,
      [storeId]
    );
    const store = storeRes.rows[0];
    if (!store) {
      log.warn("[invoice-auto] Store not found for invoice generation", { saleId, storeId });
      return null;
    }

    const storeAddress = [store.address_line1, store.address_line2, store.city, store.state]
      .filter(Boolean).join(", ");

    // 3. Fetch sale header (for customer info on DUE sales)
    const saleRes = await pool.query(
      `SELECT total_minor, customer_name, customer_phone, bill_ref
       FROM sales WHERE id = $1 AND store_id = $2`,
      [saleId, storeId]
    );
    const sale = saleRes.rows[0];
    if (!sale) {
      log.warn("[invoice-auto] Sale not found for invoice generation", { saleId });
      return null;
    }

    // 4. Fetch sale items with product details for HSN/GST
    const itemsRes = await pool.query(
      `SELECT si.name, si.quantity, si.price_minor, si.discount_minor, si.line_total_minor,
              sp.hsn_code, sp.gst_rate
       FROM sale_items si
       LEFT JOIN catalog.supplier_products sp ON sp.id = si.variant_id::uuid
       WHERE si.sale_id = $1
       ORDER BY si.created_at ASC`,
      [saleId]
    );

    if (itemsRes.rows.length === 0) {
      log.warn("[invoice-auto] No sale items found for invoice", { saleId });
      return null;
    }

    // 5. Build invoice input
    const buyerName = sale.customer_name || "Walk-in Customer";

    const invoice = await createInvoice(pool, {
      invoiceModel: "buy_resell",
      invoiceType: "sale",
      seller: {
        type: "store",
        id: storeId,
        name: store.name || "Store",
        gstin: store.gstin || undefined,
        address: storeAddress || undefined,
        state: store.state || undefined,
      },
      buyer: {
        type: "store", // Walk-in customer mapped as generic buyer
        name: buyerName,
      },
      items: itemsRes.rows.map((row) => ({
        productName: row.name || "Unknown Product",
        quantity: Number(row.quantity),
        unitPriceMinor: Number(row.price_minor),
        discountMinor: Number(row.discount_minor ?? 0),
        hsnCode: row.hsn_code || undefined,
        gstRate: row.gst_rate != null ? Number(row.gst_rate) : 0,
      })),
      orderId: saleId,
      referenceNote: `POS Sale ${sale.bill_ref || saleId} — ${paymentMode}`,
      createdBy: "pos-auto-invoice",
    });

    // 6. Issue immediately (draft → issued)
    await issueInvoice(pool, invoice.id);

    log.info("[invoice-auto] Invoice generated", {
      saleId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      paymentMode,
    });

    // GCP-STG-0086: Auto-send bill via WhatsApp if customer phone available
    if (sale.customer_phone) {
      try {
        const { isWhatsAppConfigured, sendTextMessage, normalizePhone } = await import("../../../services/whatsappService");
        if (isWhatsAppConfigured()) {
          const phone = normalizePhone(sale.customer_phone);
          if (phone.length >= 10) {
            const billMsg = `🧾 *Bill Receipt*\n\nStore: ${store.name || "SuperMandi"}\nBill: ${sale.bill_ref || saleId}\nTotal: ₹${(Number(sale.total_minor) / 100).toFixed(2)}\nPayment: ${paymentMode}\nInvoice: ${invoice.invoiceNumber}\n\nThank you for shopping with us! 🙏`;
            await sendTextMessage({ to: phone, body: billMsg });
            log.info("[invoice-auto] WhatsApp receipt sent", { saleId, phone });
          }
        }
      } catch (waErr) {
        log.warn("[invoice-auto] WhatsApp auto-send failed (non-critical):", waErr);
      }
    }

    return invoice.id;
  } catch (err: any) {
    // Never throw — invoice failure must not affect payment
    log.error("[invoice-auto] Failed to generate invoice", {
      saleId,
      storeId,
      error: err?.message,
    });
    return null;
  }
}

// GO-LIVE-184: Rate limit cash payments to 30/min per store
// SEC-001: POST /payments/cash requires ACTIVE store status
posSalesRouter.post("/payments/cash", requireDeviceToken, requireActiveStore, financialOperationsRateLimiter, async (req, res) => {
  // GCP-STG-0656: Accept idempotencyKey for double-payment prevention
  const { saleId, idempotencyKey } = req.body as { saleId?: string; idempotencyKey?: string };

  if (typeof saleId !== "string" || saleId.trim().length === 0) {
    return res.status(400).json({ error: "saleId is required" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId, deviceId } = getDeviceContextFromPosDevice(req, "pos/sales");

  // GCP-STG-0656: Idempotency check — if key provided, return existing payment
  if (typeof idempotencyKey === "string" && idempotencyKey.trim()) {
    const existing = await pool.query(
      `SELECT p.id, p.status FROM payments p
       WHERE p.sale_id = $1 AND p.store_id = $2 AND p.mode = 'CASH'
       AND p.created_at > NOW() - INTERVAL '5 minutes'
       LIMIT 1`,
      [saleId, storeId]
    );
    if (existing.rows[0]) {
      return res.json({ status: "PAID", idempotent: true });
    }
  }

  const store = await getStore(storeId);
  if (!store) {
    return res.status(404).json({ error: "store not found" });
  }
  if (!store.active) {
    return res.status(403).json({ error: "store_inactive" });
  }

  // Use transaction to ensure atomicity: payment + stock deduction + status update
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    // GCP-STG-0084 FIX: Set RLS store context for defense-in-depth
    await client.query("SELECT set_config('app.current_store_id', $1::text, true)", [storeId]);

    // AUD-060-D FIX: Get sale WITH ROW LOCK to prevent cancel+payment race
    const saleRes = await client.query(
      `
      SELECT id, store_id, status, total_minor, created_at
      FROM sales
      WHERE id = $1 AND store_id = $2
      FOR UPDATE
      `,
      [saleId, storeId]
    );

    const sale = saleRes.rows[0];
    if (!sale) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "sale not found" });
    }

    if (sale.status !== "PENDING") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "sale_not_pending",
        message: `Sale is in ${sale.status} status and cannot accept payment`
      });
    }

    // GO-LIVE-042: Check reservation expiry
    if (isSaleReservationExpired(sale.created_at)) {
      // LIVE.BE.STORE_ISOLATION: Add store_id to WHERE clause
      await client.query(`UPDATE sales SET status = 'EXPIRED' WHERE id = $1 AND store_id = $2`, [saleId, storeId]);
      await client.query("COMMIT");
      return res.status(410).json({
        error: "sale_reservation_expired",
        message: "Sale reservation has expired (30 minutes). Please create a new sale."
      });
    }

    // Get sale items for stock deduction
    // STG-100: Include stock_quantity for retail variant deduction (same as confirm endpoint)
    const itemsRes = await client.query(
      `
      SELECT variant_id, quantity, stock_quantity
      FROM sale_items
      WHERE sale_id = $1
      `,
      [saleId]
    );

    const items = itemsRes.rows.map((row) => {
      const billingQty = Number(row.quantity ?? 0);
      // STG-100: Use stock_quantity if present (retail variant), otherwise billing quantity
      const stockQty = row.stock_quantity != null ? Number(row.stock_quantity) : billingQty;
      return {
        variantId: String(row.variant_id),
        quantity: Number.isFinite(stockQty) && stockQty > 0 ? stockQty : billingQty
      };
    });

    // GO-LIVE-117: Re-verify stock availability - CRITICAL for overselling prevention
    // Stock is NOT reserved during PENDING state - another sale could consume it
    // This final check ensures we don't oversell even with concurrent pending sales
    // If this fails, payment is rejected with InsufficientStockError
    await ensureStoreInventoryAvailability({
      client,
      storeId,
      items: items.map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
        globalProductId: null,
        name: null
      }))
    });

    // Deduct stock NOW (only after payment is confirmed and stock verified)
    // GCP-STG-0329: Pass saleId so applyBulkDeductions skips already-deducted products
    await applyBulkDeductions({
      client,
      storeId,
      items,
      saleId
    });

    const paymentId = randomUUID();
    await client.query(
      `
      INSERT INTO payments (id, sale_id, store_id, mode, status, amount_minor)
      VALUES ($1, $2, $3::uuid, $4, $5, $6)
      `,
      [paymentId, saleId, storeId, "CASH", "PAID", sale.total_minor]
    );

    // GO-LIVE-069: Update both status and payment_status
    await client.query(
      // LIVE.BE.STORE_ISOLATION: Add store_id to WHERE clause
      `UPDATE sales SET status = 'PAID_CASH', payment_status = 'paid' WHERE id = $1 AND store_id = $2`,
      [saleId, storeId]
    );

    await client.query("COMMIT");

    // GCP-STG-0077: Fire-and-forget invoice generation after successful cash payment
    generateSaleInvoice(pool, saleId, storeId, "CASH").catch(() => {});
    void logPosEventSafe({ deviceId: (req as any).deviceId ?? "backend", storeId, eventType: "PAYMENT_COMPLETED", payload: { saleId, method: "CASH" } });
    // GCP-STG-0382: Fire-and-forget payment_completed lifecycle event (CASH)
    void publishLifecycleEvent({
      eventType: "payment_completed",
      orderId: saleId,
      storeId,
      supplierId: null,
      targets: [{ role: "retailer", channels: ["in_app", "whatsapp"] }],
      payload: { saleId, method: "CASH" },
      timestamp: new Date().toISOString(),
    }).catch(() => {});

    return res.json({ status: "PAID" });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error instanceof InsufficientStockError) {
      const message =
        error.details.length === 1
          ? error.details[0].message
          : "Stock changed since sale was created.";
      return res.status(409).json({
        error: "insufficient_stock",
        message,
        details: error.details
      });
    }
    // T-177: Handle optimistic concurrency conflict on stock_balances
    if (error instanceof StockVersionConflictError) {
      return res.status(409).json({
        error: "stock_version_conflict",
        message: "Stock changed, please refresh"
      });
    }
    return res.status(500).json({ error: "failed to process payment" });
  } finally {
    client.release();
  }
});

// GO-LIVE-184: Rate limit due payments to 30/min per store
// SEC-001: POST /payments/due requires ACTIVE store status
posSalesRouter.post("/payments/due", requireDeviceToken, requireActiveStore, financialOperationsRateLimiter, async (req, res) => {
  // GCP-STG-0053: Accept customerName + customerPhone from body (POS sends them for DUE)
  // GCP-STG-0656: Accept idempotencyKey for double-payment prevention
  const { saleId, customerName, customerPhone, idempotencyKey } = req.body as {
    saleId?: string;
    customerName?: string;
    customerPhone?: string;
    idempotencyKey?: string;
  };

  if (typeof saleId !== "string" || saleId.trim().length === 0) {
    return res.status(400).json({ error: "saleId is required" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId, deviceId } = getDeviceContextFromPosDevice(req, "pos/sales");

  // GCP-STG-0656: Idempotency check — if key provided, return existing payment
  if (typeof idempotencyKey === "string" && idempotencyKey.trim()) {
    const existing = await pool.query(
      `SELECT p.id, p.status FROM payments p
       WHERE p.sale_id = $1 AND p.store_id = $2 AND p.mode = 'DUE'
       AND p.created_at > NOW() - INTERVAL '5 minutes'
       LIMIT 1`,
      [saleId, storeId]
    );
    if (existing.rows[0]) {
      return res.json({ status: "DUE", idempotent: true });
    }
  }

  const store = await getStore(storeId);
  if (!store) {
    return res.status(404).json({ error: "store not found" });
  }
  if (!store.active) {
    return res.status(403).json({ error: "store_inactive" });
  }

  // Use transaction to ensure atomicity: payment + stock deduction + status update
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    // GCP-STG-0084 FIX: Set RLS store context for defense-in-depth
    await client.query("SELECT set_config('app.current_store_id', $1::text, true)", [storeId]);

    // AUD-060-D FIX: Get sale WITH ROW LOCK to prevent cancel+payment race
    const saleRes = await client.query(
      `
      SELECT id, store_id, status, total_minor, customer_name, customer_phone, created_at
      FROM sales
      WHERE id = $1 AND store_id = $2
      FOR UPDATE
      `,
      [saleId, storeId]
    );

    const sale = saleRes.rows[0];
    if (!sale) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "sale not found" });
    }

    if (sale.status !== "PENDING") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "sale_not_pending",
        message: `Sale is in ${sale.status} status and cannot accept payment`
      });
    }

    // GCP-STG-0053: Set customer info from request body if not already on sale
    // POS sends customerName + customerPhone with the DUE payment request
    const effectivePhone = sale.customer_phone || (typeof customerPhone === "string" ? customerPhone.trim() : null);
    const effectiveName = sale.customer_name || (typeof customerName === "string" ? customerName.trim() : null);
    if (effectivePhone && !sale.customer_phone) {
      await client.query(
        `UPDATE sales SET customer_name = $1, customer_phone = $2 WHERE id = $3 AND store_id = $4`,
        [effectiveName, effectivePhone, saleId, storeId]
      );
      sale.customer_name = effectiveName;
      sale.customer_phone = effectivePhone;
    }

    // DATA-004: Validate customer_phone for DUE payments — unrecoverable without it
    if (!sale.customer_phone) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "customer_phone_required",
        message: "Customer phone is required for DUE payments"
      });
    }

    // SA-P1-003: Due limit enforcement — reject if outstanding dues would exceed store limit
    {
      const dueLimitRes = await client.query(
        `SELECT max_outstanding_dues_paise FROM platform.stores WHERE id = $1::uuid`,
        [storeId]
      );
      const maxDuesPaise = dueLimitRes.rows[0]?.max_outstanding_dues_paise;
      if (maxDuesPaise != null) {
        const currentDuesRes = await client.query(
          `SELECT COALESCE(SUM(amount_minor), 0)::BIGINT as total FROM payments.customer_dues WHERE store_id = $1 AND status = 'pending'`,
          [storeId]
        );
        const currentPaise = Number(currentDuesRes.rows[0]?.total ?? 0);
        const newTotal = currentPaise + Number(sale.total_minor);
        if (newTotal > Number(maxDuesPaise)) {
          await client.query("ROLLBACK");
          return res.status(422).json({
            error: "DUE_LIMIT_EXCEEDED",
            currentPaise,
            limitPaise: Number(maxDuesPaise),
          });
        }
      }
    }

    // GO-LIVE-042: Check reservation expiry
    if (isSaleReservationExpired(sale.created_at)) {
      // LIVE.BE.STORE_ISOLATION: Add store_id to WHERE clause
      await client.query(`UPDATE sales SET status = 'EXPIRED' WHERE id = $1 AND store_id = $2`, [saleId, storeId]);
      await client.query("COMMIT");
      return res.status(410).json({
        error: "sale_reservation_expired",
        message: "Sale reservation has expired (30 minutes). Please create a new sale."
      });
    }

    // Get sale items for stock deduction
    // STG-100: Include stock_quantity for retail variant deduction (same as confirm endpoint)
    const itemsRes = await client.query(
      `
      SELECT variant_id, quantity, stock_quantity
      FROM sale_items
      WHERE sale_id = $1
      `,
      [saleId]
    );

    const items = itemsRes.rows.map((row) => {
      const billingQty = Number(row.quantity ?? 0);
      // STG-100: Use stock_quantity if present (retail variant), otherwise billing quantity
      const stockQty = row.stock_quantity != null ? Number(row.stock_quantity) : billingQty;
      return {
        variantId: String(row.variant_id),
        quantity: Number.isFinite(stockQty) && stockQty > 0 ? stockQty : billingQty
      };
    });

    // GO-LIVE-117: Re-verify stock availability - CRITICAL for overselling prevention
    // Stock is NOT reserved during PENDING state - another sale could consume it
    // This final check ensures we don't oversell even with concurrent pending sales
    // If this fails, payment is rejected with InsufficientStockError
    await ensureStoreInventoryAvailability({
      client,
      storeId,
      items: items.map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
        globalProductId: null,
        name: null
      }))
    });

    // Deduct stock NOW (only after payment is confirmed and stock verified)
    // GCP-STG-0329: Pass saleId so applyBulkDeductions skips already-deducted products
    await applyBulkDeductions({
      client,
      storeId,
      items,
      saleId
    });

    const paymentId = randomUUID();
    await client.query(
      `
      INSERT INTO payments (id, sale_id, store_id, mode, status, amount_minor)
      VALUES ($1, $2, $3::uuid, $4, $5, $6)
      `,
      [paymentId, saleId, storeId, "DUE", "DUE", sale.total_minor]
    );

    // GO-LIVE-069: Update both status and payment_status
    await client.query(
      // LIVE.BE.STORE_ISOLATION: Add store_id to WHERE clause
      `UPDATE sales SET status = 'DUE', payment_status = 'due' WHERE id = $1 AND store_id = $2`,
      [saleId, storeId]
    );

    // GO-LIVE-070: Create AR (Accounts Receivable) record for DUE payment
    await client.query(
      `INSERT INTO accounts_receivable (store_id, sale_id, payment_id, amount_minor, currency, status)
       VALUES ($1, $2, $3::uuid, $4, 'INR', 'outstanding')
       ON CONFLICT (sale_id) DO UPDATE SET
         amount_minor = EXCLUDED.amount_minor,
         updated_at = NOW()`,
      [storeId, saleId, paymentId, sale.total_minor]
    );

    // POS-DUE-002: Auto-create customer_dues record for due tracking
    await client.query(
      `INSERT INTO payments.customer_dues (store_id, sale_id, customer_name, customer_phone, amount_minor, status)
       VALUES ($1, $2::uuid, $3, $4, $5, 'pending')
       ON CONFLICT DO NOTHING`,
      [storeId, saleId, sale.customer_name || null, sale.customer_phone || null, sale.total_minor]
    );

    await client.query("COMMIT");

    // GCP-STG-0077: Fire-and-forget invoice generation after successful due payment
    generateSaleInvoice(pool, saleId, storeId, "DUE").catch(() => {});
    void logPosEventSafe({ deviceId: (req as any).deviceId ?? "backend", storeId, eventType: "SALE_COMPLETED", payload: { saleId, method: "DUE" } });
    // GCP-STG-0382: Fire-and-forget payment_completed lifecycle event (DUE)
    void publishLifecycleEvent({
      eventType: "payment_completed",
      orderId: saleId,
      storeId,
      supplierId: null,
      targets: [{ role: "retailer", channels: ["in_app", "whatsapp"] }],
      payload: { saleId, method: "DUE" },
      timestamp: new Date().toISOString(),
    }).catch(() => {});

    return res.json({ status: "DUE", paymentId });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error instanceof InsufficientStockError) {
      const message =
        error.details.length === 1
          ? error.details[0].message
          : "Stock changed since sale was created.";
      return res.status(409).json({
        error: "insufficient_stock",
        message,
        details: error.details
      });
    }
    // T-177: Handle optimistic concurrency conflict on stock_balances
    if (error instanceof StockVersionConflictError) {
      return res.status(409).json({
        error: "stock_version_conflict",
        message: "Stock changed, please refresh"
      });
    }
    return res.status(500).json({ error: "failed to process payment" });
  } finally {
    client.release();
  }
});

// SEC-001: POST /collections/upi/init requires ACTIVE store status
posSalesRouter.post("/collections/upi/init", requireDeviceToken, requireActiveStore, async (req, res) => {
  const { amountMinor, reference, transactionId, upiIntent } = req.body as {
    amountMinor?: number;
    reference?: string | null;
    transactionId?: string;
    upiIntent?: string;
  };

  if (typeof amountMinor !== "number" || !Number.isFinite(amountMinor) || amountMinor <= 0) {
    return res.status(400).json({ error: "amountMinor is required" });
  }
  if (typeof upiIntent === "string" && upiIntent.trim().length > 0) {
    return res.status(400).json({ error: "upi_intent_not_allowed" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId, deviceId } = getDeviceContextFromPosDevice(req, "pos/sales");
  const store = await getStore(storeId);
  if (!store) {
    return res.status(404).json({ error: "store not found" });
  }

  if (!store.active) {
    return res.status(403).json({ error: "store_inactive" });
  }

  if (!store.upi_vpa) {
    return res.status(400).json({ error: "upi_vpa_missing" });
  }

  const normalizedReference =
    reference && reference.trim().length > 0
      ? reference.trim()
      : typeof transactionId === "string" && transactionId.trim().length > 0
      ? transactionId.trim()
      : null;

  const collectionId = randomUUID();
  await pool.query(
    `
    INSERT INTO collections (id, store_id, device_id, amount_minor, mode, reference, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [collectionId, storeId, deviceId, Math.round(amountMinor), "UPI", normalizedReference, "PENDING"]
  );

  return res.json({
    collectionId,
    amountMinor,
    storeName: store.name,
    upiVpa: store.upi_vpa
  });
});

// SEC-001: POST /collections/upi/confirm-manual requires ACTIVE store status
posSalesRouter.post("/collections/upi/confirm-manual", requireDeviceToken, requireActiveStore, async (req, res) => {
  const { collectionId } = req.body as { collectionId?: string };

  if (typeof collectionId !== "string" || collectionId.trim().length === 0) {
    return res.status(400).json({ error: "collectionId is required" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId, deviceId } = getDeviceContextFromPosDevice(req, "pos/sales");
  const collectionStatus = await getCollectionStoreStatus(storeId, collectionId);
  if (!collectionStatus) {
    return res.status(404).json({ error: "collection not found" });
  }
  if (collectionStatus.store_id !== storeId) {
    return res.status(404).json({ error: "collection not found" });
  }
  if (!collectionStatus.active) {
    return res.status(403).json({ error: "store_inactive" });
  }

  const updated = await pool.query(
    `
    UPDATE collections
    SET status = 'PAID'
    WHERE id = $1
    RETURNING id
    `,
    [collectionId]
  );

  if (updated.rowCount === 0) {
    return res.status(404).json({ error: "collection not found" });
  }

  return res.json({ status: "PAID" });
});

// SEC-001: POST /collections/cash requires ACTIVE store status
posSalesRouter.post("/collections/cash", requireDeviceToken, requireActiveStore, async (req, res) => {
  const { amountMinor, reference } = req.body as {
    amountMinor?: number;
    reference?: string | null;
  };

  if (typeof amountMinor !== "number" || !Number.isFinite(amountMinor) || amountMinor <= 0) {
    return res.status(400).json({ error: "amountMinor is required" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId, deviceId } = getDeviceContextFromPosDevice(req, "pos/sales");
  const store = await getStore(storeId);
  if (!store) {
    return res.status(404).json({ error: "store not found" });
  }
  if (!store.active) {
    return res.status(403).json({ error: "store_inactive" });
  }

  const collectionId = randomUUID();
  await pool.query(
    `
    INSERT INTO collections (id, store_id, device_id, amount_minor, mode, reference, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [collectionId, storeId, deviceId, Math.round(amountMinor), "CASH", reference ?? null, "PAID"]
  );

  return res.json({ status: "PAID", collectionId });
});

// SEC-001: POST /collections/due requires ACTIVE store status
posSalesRouter.post("/collections/due", requireDeviceToken, requireActiveStore, async (req, res) => {
  const { amountMinor, reference } = req.body as {
    amountMinor?: number;
    reference?: string | null;
  };

  if (typeof amountMinor !== "number" || !Number.isFinite(amountMinor) || amountMinor <= 0) {
    return res.status(400).json({ error: "amountMinor is required" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId, deviceId } = getDeviceContextFromPosDevice(req, "pos/sales");
  const store = await getStore(storeId);
  if (!store) {
    return res.status(404).json({ error: "store not found" });
  }
  if (!store.active) {
    return res.status(403).json({ error: "store_inactive" });
  }

  const collectionId = randomUUID();
  await pool.query(
    `
    INSERT INTO collections (id, store_id, device_id, amount_minor, mode, reference, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [collectionId, storeId, deviceId, Math.round(amountMinor), "DUE", reference ?? null, "DUE"]
  );

  return res.json({ status: "DUE", collectionId });
});

// =============================================================================
// GO-LIVE-036: Payment verification after network drop
// =============================================================================
// This endpoint allows the POS to check if a payment was recorded after
// a network drop. The POS can poll this endpoint to recover from network errors.

/**
 * GET /api/v1/pos/sales/:saleId/payment-status
 *
 * Check the payment status of a sale after a network drop.
 * Returns the current sale status and any associated payment details.
 *
 * Response:
 * - saleStatus: PENDING | PAID_CASH | PAID_UPI | DUE | CANCELLED | EXPIRED
 * - paymentRecorded: boolean - whether a payment was recorded
 * - paymentDetails: { paymentId, mode, status, amountMinor, confirmedAt } | null
 */
posSalesRouter.get("/sales/:saleId/payment-status", requireDeviceToken, async (req, res) => {
  const saleId = typeof req.params.saleId === "string" ? req.params.saleId.trim() : "";
  if (!saleId) {
    return res.status(400).json({ error: "saleId is required" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromPosDevice(req, "pos/sales");

  try {
    // Get sale status
    const saleRes = await pool.query(
      `
      SELECT id, status, total_minor, bill_ref, created_at
      FROM sales
      WHERE id = $1 AND store_id = $2
      `,
      [saleId, storeId]
    );

    const sale = saleRes.rows[0];
    if (!sale) {
      return res.status(404).json({ error: "sale_not_found" });
    }

    // Get payment if exists
    const paymentRes = await pool.query(
      `
      SELECT id, mode, status, amount_minor, confirmed_at, created_at
      FROM payments
      WHERE sale_id = $1
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [saleId]
    );

    const payment = paymentRes.rows[0];
    const paymentRecorded = !!payment && (payment.status === "PAID" || payment.status === "DUE");

    return res.json({
      saleId: String(sale.id),
      billRef: String(sale.bill_ref),
      saleStatus: String(sale.status),
      totalMinor: Number(sale.total_minor ?? 0),
      paymentRecorded,
      paymentDetails: payment ? {
        paymentId: String(payment.id),
        mode: String(payment.mode),
        status: String(payment.status),
        amountMinor: Number(payment.amount_minor ?? 0),
        confirmedAt: payment.confirmed_at ? new Date(payment.confirmed_at).toISOString() : null
      } : null
    });
  } catch (error) {
    log.error("[sales/payment-status] Error:", error);
    return res.status(500).json({ error: "failed to get payment status" });
  }
});

/**
 * GET /api/v1/pos/payments/:paymentId/status
 *
 * Check the status of a specific payment after a network drop.
 * Useful when the POS has the paymentId but lost connection.
 */
posSalesRouter.get("/payments/:paymentId/status", requireDeviceToken, async (req, res) => {
  const paymentId = typeof req.params.paymentId === "string" ? req.params.paymentId.trim() : "";
  if (!paymentId) {
    return res.status(400).json({ error: "paymentId is required" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromPosDevice(req, "pos/sales");

  try {
    const paymentRes = await pool.query(
      `
      SELECT p.id, p.mode, p.status, p.amount_minor, p.confirmed_at, p.created_at,
             s.id as sale_id, s.status as sale_status, s.bill_ref
      FROM payments p
      JOIN sales s ON s.id = p.sale_id
      WHERE p.id = $1 AND s.store_id = $2
      `,
      [paymentId, storeId]
    );

    const payment = paymentRes.rows[0];
    if (!payment) {
      return res.status(404).json({ error: "payment_not_found" });
    }

    return res.json({
      paymentId: String(payment.id),
      saleId: String(payment.sale_id),
      billRef: String(payment.bill_ref),
      mode: String(payment.mode),
      status: String(payment.status),
      saleStatus: String(payment.sale_status),
      amountMinor: Number(payment.amount_minor ?? 0),
      confirmedAt: payment.confirmed_at ? new Date(payment.confirmed_at).toISOString() : null,
      paymentRecorded: payment.status === "PAID" || payment.status === "DUE"
    });
  } catch (error) {
    log.error("[payments/status] Error:", error);
    return res.status(500).json({ error: "failed to get payment status" });
  }
});

// GCP-STG-0077: GET /sales/:saleId/invoice — fetch auto-generated invoice for a POS sale
posSalesRouter.get("/sales/:saleId/invoice", requireDeviceToken, async (req, res) => {
  const saleId = typeof req.params.saleId === "string" ? req.params.saleId.trim() : "";
  if (!saleId) return res.status(400).json({ error: "saleId is required" });

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromPosDevice(req, "pos/sales");

  try {
    // Verify sale belongs to store (store isolation)
    const saleCheck = await pool.query(
      `SELECT id FROM sales WHERE id = $1 AND store_id = $2`,
      [saleId, storeId]
    );
    if (saleCheck.rows.length === 0) {
      return res.status(404).json({ error: "sale_not_found" });
    }

    // Find invoice linked to this sale via order_id
    const invoiceRes = await pool.query(
      `SELECT id, invoice_number, status, total_amount_minor, created_at
       FROM invoicing.invoices WHERE order_id = $1 LIMIT 1`,
      [saleId]
    );

    if (invoiceRes.rows.length === 0) {
      return res.status(404).json({ error: "invoice_not_found", message: "Invoice not yet generated for this sale" });
    }

    const inv = invoiceRes.rows[0];
    return res.json({
      invoiceId: String(inv.id),
      invoiceNumber: String(inv.invoice_number),
      status: String(inv.status),
      totalAmountMinor: Number(inv.total_amount_minor),
      createdAt: new Date(inv.created_at).toISOString(),
    });
  } catch (error) {
    log.error("[sales/invoice] Error:", error);
    return res.status(500).json({ error: "failed to get invoice" });
  }
});

// =============================================================================
// GCP-STG-0361: GET /sales/:saleId/invoice/pdf — Download invoice PDF for a POS sale
// =============================================================================
posSalesRouter.get("/sales/:saleId/invoice/pdf", requireDeviceToken, async (req, res) => {
  const saleId = typeof req.params.saleId === "string" ? req.params.saleId.trim() : "";
  if (!saleId) return res.status(400).json({ error: "saleId is required" });

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromPosDevice(req, "pos/sales/invoice/pdf");

  try {
    // Store isolation: verify sale belongs to this store
    const saleCheck = await pool.query(
      `SELECT id FROM sales WHERE id = $1 AND store_id = $2`,
      [saleId, storeId]
    );
    if (saleCheck.rows.length === 0) {
      return res.status(404).json({ error: "sale_not_found" });
    }

    // Find invoice linked to this sale via order_id
    const invoiceRef = await pool.query(
      `SELECT id FROM invoicing.invoices WHERE order_id = $1 LIMIT 1`,
      [saleId]
    );
    if (invoiceRef.rows.length === 0) {
      return res.status(404).json({ error: "invoice_not_found", message: "Invoice not yet generated for this sale" });
    }

    const invoiceId = String(invoiceRef.rows[0].id);
    const invoice = await getInvoice(pool, invoiceId);
    if (!invoice) {
      return res.status(404).json({ error: "invoice_not_found" });
    }

    // GCP-STG-0727: Check if PDF is archived in GCS — prefer streaming when GCS client configured
    // Falls through to regeneration until GCS streaming is wired up
    if (invoice.pdfGcsPath) {
      // TODO: Stream from GCS when client is configured
      log.info(`[pos/sales/invoice/pdf] GCS path exists (${invoice.pdfGcsPath}), regenerating`);
    }

    // Generate QR code buffer if signed QR string exists (e-invoice)
    let qrCodeBuffer: Buffer | undefined;
    if (invoice.signedQrString) {
      const buf = await generateQrCodeBuffer(invoice.signedQrString);
      if (buf) qrCodeBuffer = buf;
    }

    const pdfDoc = generateInvoicePdf({
      ...invoice,
      irn: invoice.irn,
      ackNumber: invoice.ackNumber,
      ackDate: invoice.ackDate,
      qrCodeBuffer,
    });

    // LIVE.BE.DOCUMENTS.CONTENT_DISPOSITION_SANITIZATION.001: Strip path traversal + special chars
    const filename = `${invoice.invoiceNumber.replace(/[/\\<>"'\r\n\t]/g, "-")}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    pdfDoc.pipe(res);
  } catch (err: any) {
    log.error("[pos/sales/invoice/pdf] Error:", err);
    return res.status(500).json({ error: "Failed to generate invoice PDF" });
  }
});

// =============================================================================
// GCP-STG-0668: SHIFT CLOSE / CASH RECONCILIATION
// =============================================================================

/**
 * POST /api/v1/pos/sales/shift-close
 * GCP-STG-0668: Day-end cash reconciliation. Returns today's sales summary
 * with cash/UPI/due breakdown and variance calculation.
 */
posSalesRouter.post("/shift-close", requireDeviceToken, requireActiveStore, async (req, res) => {
  const { actualCashAmount, staffId } = req.body || {};
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "Service unavailable" });

  const storeId = getStoreIdFromPosDevice(req as any, "shift-close");

  try {
    const summary = await pool.query(`
      SELECT
        COUNT(*) as total_sales,
        COALESCE(SUM(total_minor), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN payment_method = 'CASH' THEN total_minor ELSE 0 END), 0) as cash_total,
        COALESCE(SUM(CASE WHEN payment_method = 'UPI' THEN total_minor ELSE 0 END), 0) as upi_total,
        COALESCE(SUM(CASE WHEN payment_method = 'DUE' THEN total_minor ELSE 0 END), 0) as due_total
      FROM pos.sales
      WHERE store_id = $1 AND created_at >= CURRENT_DATE AND status = 'COMPLETED'
    `, [storeId]);

    const row = summary.rows[0];
    const expectedCash = parseInt(row.cash_total) || 0;
    const actualCash = actualCashAmount != null ? parseInt(String(actualCashAmount)) : null;
    const variance = actualCash !== null ? actualCash - expectedCash : null;

    return res.json({
      date: new Date().toISOString().split("T")[0],
      storeId,
      staffId: staffId || null,
      totalSales: parseInt(row.total_sales) || 0,
      totalRevenue: parseInt(row.total_revenue) || 0,
      cashTotal: expectedCash,
      upiTotal: parseInt(row.upi_total) || 0,
      dueTotal: parseInt(row.due_total) || 0,
      actualCashAmount: actualCash,
      cashVariance: variance,
      status: variance === null ? "UNCOUNTED" : Math.abs(variance) <= 100 ? "BALANCED" : "VARIANCE",
    });
  } catch (err: any) {
    log.error("[GCP-STG-0668] Shift close error:", err.message);
    return res.status(500).json({ error: "Failed to generate shift close report" });
  }
});

// =============================================================================
// GCP-STG-0669: Z-REPORT (DAILY TAX TOTALS)
// =============================================================================

/**
 * GET /api/v1/pos/sales/z-report
 * GCP-STG-0669: Daily tax summary for GST compliance.
 * Returns gross total, discounts, net total, and total tax for a given date.
 */
posSalesRouter.get("/z-report", requireDeviceToken, requireActiveStore, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "Service unavailable" });

  const storeId = getStoreIdFromPosDevice(req as any, "z-report");
  const date = (req.query.date as string) || new Date().toISOString().split("T")[0];

  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total_transactions,
        COALESCE(SUM(total_minor), 0) as gross_total,
        COALESCE(SUM(discount_minor), 0) as total_discount,
        COALESCE(SUM(tax_minor), 0) as total_tax,
        COALESCE(SUM(total_minor - COALESCE(tax_minor, 0)), 0) as net_total
      FROM pos.sales
      WHERE store_id = $1 AND created_at::date = $2 AND status = 'COMPLETED'
    `, [storeId, date]);

    const row = result.rows[0];
    return res.json({
      reportType: "Z-REPORT",
      storeId,
      date,
      totalTransactions: parseInt(row.total_transactions) || 0,
      grossTotal: parseInt(row.gross_total) || 0,
      totalDiscount: parseInt(row.total_discount) || 0,
      totalTax: parseInt(row.total_tax) || 0,
      netTotal: parseInt(row.net_total) || 0,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    log.error("[GCP-STG-0669] Z-report error:", err.message);
    return res.status(500).json({ error: "Failed to generate Z-report" });
  }
});
