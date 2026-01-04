import { randomUUID } from "crypto";
import { getPool } from "../db/client";

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
};

export type ScanResult =
  | { action: "IGNORED" }
  | { action: Exclude<ScanAction, "IGNORED">; product: PosProduct };

const DUPLICATE_WINDOW_MS = 500;
const CROSS_DEVICE_WINDOW_MS = 30 * 60 * 1000;
const recentScans = new Map<string, number>();

function buildProductName(barcode: string): string {
  const suffix = barcode.slice(-4);
  return `Item ${suffix || barcode}`;
}

async function fetchProductByBarcode(
  barcode: string,
  storeId: string
): Promise<PosProduct | null> {
  const pool = getPool();
  if (!pool) return null;

  const res = await pool.query(
    `
    SELECT
      p.id,
      p.name,
      p.barcode,
      p.currency,
      rp.selling_price_minor,
      COALESCE(rp.digitised_by_retailer, FALSE) AS digitised_by_retailer
    FROM products p
    LEFT JOIN retailer_products rp
      ON rp.product_id = p.id AND rp.store_id = $2
    WHERE p.barcode = $1
    LIMIT 1
    `,
    [barcode, storeId]
  );

  const row = res.rows[0];
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    barcode: row.barcode,
    currency: row.currency,
    priceMinor: row.selling_price_minor ?? null,
    digitisedByRetailer: Boolean(row.digitised_by_retailer),
  };
}

async function getStoreStatus(storeId: string): Promise<{ exists: boolean; active: boolean }> {
  const pool = getPool();
  if (!pool) return { exists: false, active: false };
  const res = await pool.query(`SELECT id, active FROM stores WHERE id = $1`, [storeId]);
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

async function createProduct(
  barcode: string,
  storeId: string
): Promise<PosProduct> {
  const pool = getPool();
  if (!pool) {
    throw new Error("db_unavailable");
  }

  const productId = randomUUID();
  const productName = buildProductName(barcode);

  const productRes = await pool.query(
    `
    INSERT INTO products (id, barcode, name, currency, retailer_status, enrichment_status)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (barcode)
    DO UPDATE SET
      name = EXCLUDED.name,
      updated_at = NOW(),
      retailer_status = COALESCE(products.retailer_status, EXCLUDED.retailer_status),
      enrichment_status = COALESCE(products.enrichment_status, EXCLUDED.enrichment_status)
    RETURNING id, name, barcode, currency
    `,
    [productId, barcode, productName, "INR", "retailer_created", "pending_enrichment"]
  );

  const product = productRes.rows[0];

  await pool.query(
    `
    INSERT INTO retailer_products (store_id, product_id, selling_price_minor, digitised_by_retailer)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (store_id, product_id)
    DO UPDATE SET digitised_by_retailer = EXCLUDED.digitised_by_retailer
    `,
    [storeId, product.id, null, true]
  );

  return {
    id: product.id,
    name: product.name,
    barcode: product.barcode,
    currency: product.currency,
    priceMinor: null,
    digitisedByRetailer: true,
  };
}

async function ensureRetailerProduct(
  storeId: string,
  productId: string
): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  await pool.query(
    `
    INSERT INTO retailer_products (store_id, product_id, selling_price_minor, digitised_by_retailer)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (store_id, product_id) DO NOTHING
    `,
    [storeId, productId, null, true]
  );
}

async function recordScanEvent(params: {
  storeId: string;
  deviceId: string | null;
  scanValue: string;
  mode: ScanMode;
  action: ScanAction;
  productId: string | null;
}): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  await pool.query(
    `
    INSERT INTO scan_events (id, store_id, device_id, scan_value, mode, action, product_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [randomUUID(), params.storeId, params.deviceId, params.scanValue, params.mode, params.action, params.productId]
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

  const existing = await fetchProductByBarcode(barcode, storeId);

  if (mode === "DIGITISE") {
    if (existing) {
      await ensureRetailerProduct(storeId, existing.id);
      const action: ScanAction = "ALREADY_DIGITISED";
      await recordScanEvent({ storeId, deviceId, scanValue: barcode, mode, action, productId: existing.id });
      return { action, product: existing };
    }

    const created = await createProduct(barcode, storeId);
    const action: ScanAction = "DIGITISED";
    await recordScanEvent({ storeId, deviceId, scanValue: barcode, mode, action, productId: created.id });
    return { action, product: created };
  }

  if (!existing) {
    const created = await createProduct(barcode, storeId);
    const action: ScanAction = "PROMPT_PRICE";
    await recordScanEvent({ storeId, deviceId, scanValue: barcode, mode, action, productId: created.id });
    return { action, product: created };
  }

  if (existing.priceMinor === null) {
    const action: ScanAction = "PROMPT_PRICE";
    await ensureRetailerProduct(storeId, existing.id);
    await recordScanEvent({ storeId, deviceId, scanValue: barcode, mode, action, productId: existing.id });
    return { action, product: existing };
  }

  const action: ScanAction = "ADD_TO_CART";
  await recordScanEvent({ storeId, deviceId, scanValue: barcode, mode, action, productId: existing.id });
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

  return fetchProductByBarcode(trimmed, storeId);
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
    `SELECT id, name, barcode, currency FROM products WHERE id = $1`,
    [productId]
  );

  const product = productRes.rows[0];
  if (!product) return null;

  await pool.query(
    `
    INSERT INTO retailer_products (store_id, product_id, selling_price_minor, digitised_by_retailer, price_updated_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (store_id, product_id)
    DO UPDATE SET selling_price_minor = EXCLUDED.selling_price_minor, price_updated_at = NOW()
    `,
    [storeId, productId, Math.round(priceMinor), true]
  );

  return {
    id: product.id,
    name: product.name,
    barcode: product.barcode,
    currency: product.currency,
    priceMinor: Math.round(priceMinor),
    digitisedByRetailer: true,
  };
}
