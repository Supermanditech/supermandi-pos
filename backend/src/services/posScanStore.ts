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
  const res = await pool.query(
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
      ON rv.variant_id = v.id AND rv.store_id = $2
    WHERE b.barcode = $1
    LIMIT 1
    `,
    [lookupBarcode, storeId]
  );

  const row = res.rows[0];
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
      ON rv.variant_id = v.id AND rv.store_id = $2
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
