import { randomUUID } from "crypto";
import { getPool } from "../db/client";
import { attachBarcodeToVariant, ensureSupermandiBarcode, isSupermandiBarcode } from "./inventoryService";

export type ScanMode = "SELL" | "DIGITISE";
export type ScanAction =
  | "ADD_TO_CART"
  | "PROMPT_PRICE"
  | "DIGITISED"
  | "ALREADY_DIGITISED"
  | "IGNORED";

export type PosProduct = {
  id: string;
  name: string;
  barcode: string;
  priceMinor: number | null;
  currency: string;
  digitisedByRetailer: boolean;
  productMode?: string;
  soldBy?: string;
  rateUnit?: string;
  purchasePrice?: number | null;
};

export type ScanResult =
  | { action: "IGNORED" }
  | {
      action: Exclude<ScanAction, "IGNORED">;
      product: PosProduct;
      product_not_found_for_store?: boolean;
    };

const DUPLICATE_WINDOW_MS = 500;
const CROSS_DEVICE_WINDOW_MS = 30 * 60 * 1000;
const recentScans = new Map<string, number>();

function buildProductName(barcode: string): string {
  const suffix = barcode.slice(-4);
  return `Item ${suffix || barcode}`;
}

async function fetchStoreProductByBarcode(
  barcode: string,
  storeId: string
): Promise<PosProduct | null> {
  const pool = getPool();
  if (!pool) return null;

  const trimmed = barcode.trim();
  const lookupBarcode = isSupermandiBarcode(trimmed) ? trimmed.toUpperCase() : trimmed;

  // GL-POS-002: Query new schema FIRST (store_product_barcodes → store_products)
  // This fixes products added via Supplier Catalog → Retailer Catalog not being found
  const newSchemaRes = await pool.query(
    `
    SELECT
      sp.id,
      COALESCE(sp.display_name, p.name) as name,
      COALESCE(spb.barcode, p.primary_barcode) AS barcode,
      'INR' as currency,
      sp.sell_price as selling_price_minor,
      true as digitised_by_retailer,
      COALESCE(sb.current_qty, sp.current_stock, 0) as current_stock,
      sp.product_mode,
      sp.sold_by,
      sp.rate_unit,
      sp.purchase_price
    FROM catalog.store_products sp
    JOIN catalog.products p ON p.id = sp.product_id
    LEFT JOIN inventory.stock_balances sb
      ON sb.store_id = sp.store_id AND sb.product_id = sp.product_id
    LEFT JOIN catalog.store_product_barcodes spb
      ON spb.store_product_id = sp.id AND spb.store_id = sp.store_id AND spb.barcode = $1
    WHERE sp.store_id = $2
      AND sp.is_active = true
      AND p.is_active = true
      AND (
        spb.barcode IS NOT NULL
        OR p.primary_barcode = $1
        OR EXISTS (
          SELECT 1 FROM catalog.product_barcodes pb
          WHERE pb.product_id = p.id AND pb.barcode = $1
        )
      )
    ORDER BY sp.updated_at DESC
    LIMIT 1
    `,
    [lookupBarcode, storeId]
  );

  if (newSchemaRes.rows[0]) {
    const row = newSchemaRes.rows[0];
    return {
      id: row.id,
      name: row.name,
      barcode: row.barcode || lookupBarcode,
      currency: row.currency,
      priceMinor: row.selling_price_minor ?? null,
      digitisedByRetailer: Boolean(row.digitised_by_retailer),
      productMode: row.product_mode || 'PACKAGED',
      soldBy: row.sold_by || undefined,
      rateUnit: row.rate_unit || undefined,
      purchasePrice: row.purchase_price ?? null,
    };
  }

  // T-057: Check variant barcodes (prefix 3) — retail selling units for LOOSE_BULK
  const variantRes = await pool.query(
    `
    SELECT
      sp.id,
      COALESCE(sp.display_name, p.name) AS parent_name,
      prv.barcode,
      'INR' AS currency,
      prv.sell_price_minor AS selling_price_minor,
      true AS digitised_by_retailer,
      COALESCE(sb.current_qty, sp.current_stock, 0) AS current_stock,
      sp.product_mode,
      sp.sold_by,
      sp.rate_unit,
      sp.purchase_price,
      prv.id AS variant_id,
      prv.variant_label,
      prv.variant_qty,
      prv.base_unit
    FROM catalog.product_retail_variants prv
    JOIN catalog.store_products sp ON sp.id = prv.store_product_id
    JOIN catalog.products p ON p.id = sp.product_id
    LEFT JOIN inventory.stock_balances sb
      ON sb.store_id = sp.store_id AND sb.product_id = sp.product_id
    WHERE prv.barcode = $1
      AND sp.store_id = $2
      AND prv.is_active = true
      AND sp.is_active = true
    LIMIT 1
    `,
    [lookupBarcode, storeId]
  );

  if (variantRes.rows[0]) {
    const row = variantRes.rows[0];
    return {
      id: row.id,
      name: `${row.parent_name} — ${row.variant_label}`,
      barcode: row.barcode,
      currency: row.currency,
      priceMinor: row.selling_price_minor ?? null,
      digitisedByRetailer: true,
      productMode: row.product_mode || 'LOOSE_BULK',
      soldBy: row.sold_by || undefined,
      rateUnit: row.rate_unit || undefined,
      purchasePrice: row.purchase_price ?? null,
    };
  }

  // GL-POS-002: Fallback to legacy schema for backward compatibility
  // This supports products digitised via old POS flow (barcodes → variants → retailer_variants)
  const legacyRes = await pool.query(
    `
    SELECT
      v.id,
      v.name,
      COALESCE(sb.barcode, b.barcode) AS barcode,
      v.currency,
      rv.selling_price_minor,
      rv.digitised_by_retailer
    FROM barcodes b
    JOIN variants v
      ON v.id = b.variant_id
    LEFT JOIN barcodes sb
      ON sb.variant_id = v.id AND sb.barcode_type = 'supermandi'
    JOIN retailer_variants rv
      ON rv.variant_id = v.id AND rv.store_id = $2::uuid
    WHERE b.barcode = $1
    LIMIT 1
    `,
    [lookupBarcode, storeId]
  );

  const row = legacyRes.rows[0];
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    barcode: row.barcode,
    currency: row.currency,
    priceMinor: row.selling_price_minor ?? null,
    digitisedByRetailer: Boolean(row.digitised_by_retailer)
  };
}

async function getStoreStatus(storeId: string): Promise<{ exists: boolean; active: boolean }> {
  const pool = getPool();
  if (!pool) return { exists: false, active: false };
  const res = await pool.query(`SELECT id::TEXT as id, active FROM platform.stores WHERE id = $1::uuid`, [storeId]);
  if (!res.rows[0]) return { exists: false, active: false };
  return { exists: true, active: Boolean(res.rows[0].active) };
}

async function getLastSaleTime(storeId: string): Promise<Date | null> {
  const pool = getPool();
  if (!pool) return null;
  const res = await pool.query(
    `SELECT created_at FROM sales WHERE store_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [storeId]
  );
  const raw = res.rows[0]?.created_at;
  if (!raw) return null;
  const ts = raw instanceof Date ? raw : new Date(raw);
  return Number.isFinite(ts.getTime()) ? ts : null;
}

async function isDuplicateScan(params: { storeId: string; scanValue: string; mode: ScanMode }): Promise<boolean> {
  const pool = getPool();
  if (!pool) return false;
  const since = new Date(Date.now() - DUPLICATE_WINDOW_MS);
  const res = await pool.query(
    `
      SELECT 1
      FROM scan_events
      WHERE store_id = $1
        AND scan_value = $2
        AND mode = $3
        AND created_at >= $4
      LIMIT 1
    `,
    [params.storeId, params.scanValue, params.mode, since]
  );
  return (res.rowCount ?? 0) > 0;
}

async function isCrossDeviceDuplicate(params: {
  storeId: string;
  scanValue: string;
  mode: ScanMode;
  deviceId: string;
}): Promise<boolean> {
  const pool = getPool();
  if (!pool) return false;

  const lastSale = await getLastSaleTime(params.storeId);
  const windowSince = new Date(Date.now() - CROSS_DEVICE_WINDOW_MS);
  const since = lastSale && lastSale > windowSince ? lastSale : windowSince;

  const res = await pool.query(
    `
      SELECT device_id
      FROM scan_events
      WHERE store_id = $1
        AND scan_value = $2
        AND mode = $3
        AND action = 'ADD_TO_CART'
        AND device_id IS NOT NULL
        AND device_id <> $4
        AND created_at >= $5
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [params.storeId, params.scanValue, params.mode, params.deviceId, since]
  );

  return (res.rowCount ?? 0) > 0;
}

function isDuplicateScanMemory(key: string): boolean {
  const now = Date.now();
  const last = recentScans.get(key);

  if (last && now - last < DUPLICATE_WINDOW_MS) {
    return true;
  }

  recentScans.set(key, now);

  // Best-effort cleanup.
  for (const [k, ts] of recentScans.entries()) {
    if (now - ts > DUPLICATE_WINDOW_MS * 4) {
      recentScans.delete(k);
    }
  }

  return false;
}

async function createProduct(barcode: string, storeId: string): Promise<PosProduct> {
  const pool = getPool();
  if (!pool) {
    throw new Error("db_unavailable");
  }

  const trimmed = barcode.trim();
  const productName = buildProductName(trimmed);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const lookupBarcode = isSupermandiBarcode(trimmed) ? trimmed.toUpperCase() : trimmed;
    const existingRes = await client.query(
      `
      SELECT v.id, v.name, v.currency, b.barcode
      FROM barcodes b
      JOIN variants v ON v.id = b.variant_id
      WHERE b.barcode = $1
      LIMIT 1
      `,
      [lookupBarcode]
    );

    if (existingRes.rows[0]) {
      const row = existingRes.rows[0];
      await client.query(
        `
        INSERT INTO retailer_variants (store_id, variant_id, selling_price_minor, digitised_by_retailer)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (store_id, variant_id)
        DO UPDATE SET digitised_by_retailer = EXCLUDED.digitised_by_retailer
        `,
        [storeId, row.id, null, true]
      );
      await client.query("COMMIT");

      const existing = await fetchStoreProductByBarcode(barcode, storeId);
      if (existing) {
        return existing;
      }

      return {
        id: row.id,
        name: row.name,
        barcode: row.barcode,
        currency: row.currency,
        priceMinor: null,
        digitisedByRetailer: true
      };
    }

    const productId = randomUUID();
    const variantId = randomUUID();

    await client.query(
      `
      INSERT INTO products (id, name, category, retailer_status, enrichment_status)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [productId, productName, null, "retailer_created", "pending_enrichment"]
    );

    await client.query(
      `
      INSERT INTO variants (id, product_id, name, currency)
      VALUES ($1, $2, $3, $4)
      `,
      [variantId, productId, productName, "INR"]
    );

    await attachBarcodeToVariant(client, trimmed, variantId);
    const supermandiBarcode = await ensureSupermandiBarcode(client, variantId);

    await client.query(
      `
      INSERT INTO retailer_variants (store_id, variant_id, selling_price_minor, digitised_by_retailer)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (store_id, variant_id)
      DO UPDATE SET digitised_by_retailer = EXCLUDED.digitised_by_retailer
      `,
      [storeId, variantId, null, true]
    );

    await client.query("COMMIT");

    return {
      id: variantId,
      name: productName,
      barcode: supermandiBarcode,
      currency: "INR",
      priceMinor: null,
      digitisedByRetailer: true
    };
  } catch (error) {
    await client.query("ROLLBACK");
    const existing = await fetchStoreProductByBarcode(barcode, storeId);
    if (existing) {
      return existing;
    }
    throw error;
  } finally {
    client.release();
  }
}

async function ensureRetailerVariant(
  storeId: string,
  variantId: string
): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  await pool.query(
    `
    INSERT INTO retailer_variants (store_id, variant_id, selling_price_minor, digitised_by_retailer)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (store_id, variant_id) DO NOTHING
    `,
    [storeId, variantId, null, true]
  );
}

async function recordScanEvent(params: {
  storeId: string;
  deviceId: string | null;
  scanValue: string;
  mode: ScanMode;
  action: ScanAction;
  variantId: string | null;
}): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  await pool.query(
    `
    INSERT INTO scan_events (id, store_id, device_id, scan_value, mode, action, variant_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [randomUUID(), params.storeId, params.deviceId, params.scanValue, params.mode, params.action, params.variantId]
  );
}

export async function resolveScan(
  scanValue: string,
  mode: ScanMode,
  storeId: string,
  deviceId: string
): Promise<ScanResult> {
  const barcode = scanValue.trim();
  const pool = getPool();
  if (!pool) {
    throw new Error("db_unavailable");
  }

  const store = await getStoreStatus(storeId);
  if (!store.exists) {
    throw new Error("store_not_found");
  }
  if (!store.active) {
    throw new Error("store_inactive");
  }

  const dedupeKey = `${storeId}:${mode}:${barcode}`;
  if (isDuplicateScanMemory(dedupeKey)) {
    return { action: "IGNORED" };
  }

  if (await isDuplicateScan({ storeId, scanValue: barcode, mode })) {
    return { action: "IGNORED" };
  }

  if (mode === "SELL" && deviceId) {
    const crossDevice = await isCrossDeviceDuplicate({
      storeId,
      scanValue: barcode,
      mode,
      deviceId
    });
    if (crossDevice) {
      return { action: "IGNORED" };
    }
  }

  const existing = await fetchStoreProductByBarcode(barcode, storeId);

  if (mode === "DIGITISE") {
    if (existing) {
      await ensureRetailerVariant(storeId, existing.id);
      const action: ScanAction = "ALREADY_DIGITISED";
      await recordScanEvent({ storeId, deviceId, scanValue: barcode, mode, action, variantId: existing.id });
      return { action, product: existing };
    }

    const created = await createProduct(barcode, storeId);
    const action: ScanAction = "DIGITISED";
    await recordScanEvent({ storeId, deviceId, scanValue: barcode, mode, action, variantId: created.id });
    return { action, product: created };
  }

  if (!existing) {
    const created = await createProduct(barcode, storeId);
    const action: ScanAction = "PROMPT_PRICE";
    await recordScanEvent({ storeId, deviceId, scanValue: barcode, mode, action, variantId: created.id });
    return { action, product: created, product_not_found_for_store: true };
  }

  if (existing.priceMinor === null) {
    const action: ScanAction = "PROMPT_PRICE";
    await ensureRetailerVariant(storeId, existing.id);
    await recordScanEvent({ storeId, deviceId, scanValue: barcode, mode, action, variantId: existing.id });
    return { action, product: existing };
  }

  const action: ScanAction = "ADD_TO_CART";
  await recordScanEvent({ storeId, deviceId, scanValue: barcode, mode, action, variantId: existing.id });
  return { action, product: existing };
}

export async function lookupProductByBarcode(
  barcode: string,
  storeId: string
): Promise<PosProduct | null> {
  const pool = getPool();
  if (!pool) {
    throw new Error("db_unavailable");
  }

  const trimmed = barcode.trim();
  if (!trimmed) return null;

  return fetchStoreProductByBarcode(trimmed, storeId);
}

export async function updateProductPrice(
  productId: string,
  priceMinor: number,
  storeId: string
): Promise<PosProduct | null> {
  const pool = getPool();
  if (!pool) {
    throw new Error("db_unavailable");
  }

  const store = await getStoreStatus(storeId);
  if (!store.exists) {
    throw new Error("store_not_found");
  }
  if (!store.active) {
    throw new Error("store_inactive");
  }

  const productRes = await pool.query(
    `
    SELECT v.id, v.name, v.currency, b.barcode
    FROM variants v
    LEFT JOIN barcodes b
      ON b.variant_id = v.id AND b.barcode_type = 'supermandi'
    WHERE v.id = $1
    `,
    [productId]
  );

  const product = productRes.rows[0];
  if (!product) return null;

  await pool.query(
    `
    INSERT INTO retailer_variants (store_id, variant_id, selling_price_minor, digitised_by_retailer, price_updated_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (store_id, variant_id)
    DO UPDATE SET selling_price_minor = EXCLUDED.selling_price_minor, price_updated_at = NOW()
    `,
    [storeId, productId, Math.round(priceMinor), true]
  );

  const storeRes = await pool.query(
    `
    SELECT v.id, v.name, v.currency, b.barcode, rv.selling_price_minor, rv.digitised_by_retailer
    FROM variants v
    JOIN retailer_variants rv
      ON rv.variant_id = v.id AND rv.store_id = $2::uuid
    LEFT JOIN barcodes b
      ON b.variant_id = v.id AND b.barcode_type = 'supermandi'
    WHERE v.id = $1
    `,
    [productId, storeId]
  );

  const storeProduct = storeRes.rows[0];
  if (!storeProduct) return null;

  return {
    id: storeProduct.id,
    name: storeProduct.name,
    barcode: storeProduct.barcode ?? "",
    currency: storeProduct.currency,
    priceMinor: storeProduct.selling_price_minor ?? Math.round(priceMinor),
    digitisedByRetailer: Boolean(storeProduct.digitised_by_retailer)
  };
}
