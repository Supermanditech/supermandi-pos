import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { log } from "../lib/logger";

export type BaseUnit = "g" | "ml";

const BULK_THRESHOLD_BASE = 1000;
const STANDARD_VARIANT_SIZES_BASE = [100, 250, 500, 1000];
const SUPERMANDI_REGEX = /^SM[0-9A-F]{12}$/;

type UnitNormalization = { baseUnit: BaseUnit; multiplier: number };
type Queryable = { query: (text: string, params?: any[]) => Promise<{ rows: any[] }> };
type AvailabilitySource = "bulk" | "stock" | "ledger" | "unknown";

let variantStockColumnKnown: boolean | null = null;

export function normalizeUnit(unit: string | null | undefined): UnitNormalization | null {
  const trimmed = unit?.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed === "g") return { baseUnit: "g", multiplier: 1 };
  if (trimmed === "kg") return { baseUnit: "g", multiplier: 1000 };
  if (trimmed === "ml") return { baseUnit: "ml", multiplier: 1 };
  if (trimmed === "l") return { baseUnit: "ml", multiplier: 1000 };
  return null;
}

export function isSupermandiBarcode(barcode: string): boolean {
  return SUPERMANDI_REGEX.test(barcode.trim().toUpperCase());
}

export function computeBaseQuantity(
  quantity: number,
  unit: string | null | undefined
): { baseUnit: BaseUnit; quantityBase: number } | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  const normalized = normalizeUnit(unit);
  if (!normalized) return null;
  const quantityBase = Math.round(quantity * normalized.multiplier);
  if (quantityBase <= 0) return null;
  return { baseUnit: normalized.baseUnit, quantityBase };
}

export function isBulkQuantity(quantityBase: number): boolean {
  return quantityBase >= BULK_THRESHOLD_BASE;
}

function formatSizeLabel(baseUnit: BaseUnit, sizeBase: number): string {
  if (baseUnit === "g") {
    return sizeBase === 1000 ? "1kg" : `${sizeBase}g`;
  }
  return sizeBase === 1000 ? "1l" : `${sizeBase}ml`;
}

function generateSupermandiBarcode(): string {
  return `SM${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
}

async function hasVariantStockColumn(client: Queryable): Promise<boolean> {
  if (variantStockColumnKnown !== null) return variantStockColumnKnown;
  const res = await client.query(
    `
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'variants'
      AND column_name = 'stock'
    LIMIT 1
    `
  );
  variantStockColumnKnown = (res.rows.length ?? 0) > 0;
  return variantStockColumnKnown;
}

function computeAvailabilityFromRow(
  row: any,
  hasVariantStock: boolean
): { available: number | null; source: AvailabilitySource } {
  const storeQtyRaw = row.store_available_qty;
  const storeQty =
    storeQtyRaw === null || storeQtyRaw === undefined ? null : Number(storeQtyRaw);
  if (storeQty !== null && Number.isFinite(storeQty)) {
    return {
      available: Math.max(0, Math.floor(storeQty)),
      source: "ledger"
    };
  }

  const unitBase = row.unit_base ? String(row.unit_base) : null;
  const sizeBase =
    row.size_base === null || row.size_base === undefined ? null : Number(row.size_base);
  const bulkUnit = row.bulk_base_unit ? String(row.bulk_base_unit) : null;
  const bulkQuantity =
    row.bulk_quantity_base === null || row.bulk_quantity_base === undefined
      ? null
      : Number(row.bulk_quantity_base);

  const sizeValid = typeof sizeBase === "number" && Number.isFinite(sizeBase) && sizeBase > 0;
  const bulkValid = typeof bulkQuantity === "number" && Number.isFinite(bulkQuantity);

  const isBulkVariant = unitBase && sizeValid;

  if (isBulkVariant) {
    if (bulkUnit && bulkUnit !== unitBase) {
      return { available: 0, source: "bulk" };
    }
    const safeBase = bulkValid ? Math.max(0, bulkQuantity ?? 0) : 0;
    return {
      available: Math.floor(safeBase / (sizeBase ?? 1)),
      source: "bulk"
    };
  }

  if (hasVariantStock) {
    const stock = Number(row.variant_stock ?? 0);
    return {
      available: Number.isFinite(stock) ? Math.max(0, stock) : 0,
      source: "stock"
    };
  }

  return { available: null, source: "unknown" };
}

export async function ensureSupermandiBarcode(client: PoolClient, variantId: string): Promise<string> {
  const existing = await client.query(
    `SELECT barcode FROM barcodes WHERE variant_id = $1 AND barcode_type = 'supermandi' LIMIT 1`,
    [variantId]
  );
  if (existing.rows[0]?.barcode) {
    return String(existing.rows[0].barcode);
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const barcode = generateSupermandiBarcode();
    const inserted = await client.query(
      `
      INSERT INTO barcodes (barcode, variant_id, barcode_type)
      VALUES ($1, $2, 'supermandi')
      ON CONFLICT DO NOTHING
      RETURNING barcode
      `,
      [barcode, variantId]
    );
    if (inserted.rows[0]?.barcode) {
      return String(inserted.rows[0].barcode);
    }

    const existingRetry = await client.query(
      `SELECT barcode FROM barcodes WHERE variant_id = $1 AND barcode_type = 'supermandi' LIMIT 1`,
      [variantId]
    );
    if (existingRetry.rows[0]?.barcode) {
      return String(existingRetry.rows[0].barcode);
    }
  }

  throw new Error("barcode_generation_failed");
}

export async function attachBarcodeToVariant(
  client: PoolClient,
  barcode: string,
  variantId: string
): Promise<void> {
  const trimmed = barcode.trim();
  if (!trimmed) return;
  const normalized = trimmed.toUpperCase();
  const supermandi = isSupermandiBarcode(trimmed);
  const storeBarcode = supermandi ? normalized : trimmed;

  const existing = await client.query(`SELECT variant_id FROM barcodes WHERE barcode = $1`, [storeBarcode]);
  if (existing.rows[0]?.variant_id) {
    if (String(existing.rows[0].variant_id) !== variantId) {
      throw new Error("barcode_in_use");
    }
    return;
  }

  if (!supermandi) {
    await ensureSupermandiBarcode(client, variantId);
  }

  const barcodeType = supermandi ? "supermandi" : "manufacturer";

  await client.query(
    `
    INSERT INTO barcodes (barcode, variant_id, barcode_type)
    VALUES ($1, $2, $3)
    ON CONFLICT DO NOTHING
    `,
    [storeBarcode, variantId, barcodeType]
  );
}

export async function ensureStandardVariants(params: {
  client: PoolClient;
  productId: string;
  productName: string;
  currency: string;
  baseUnit: BaseUnit;
  storeId?: string;
}): Promise<void> {
  const { client, productId, productName, currency, baseUnit, storeId } = params;
  const existingRes = await client.query(
    `
    SELECT id, size_base
    FROM variants
    WHERE product_id = $1 AND unit_base = $2 AND size_base = ANY($3::int[])
    `,
    [productId, baseUnit, STANDARD_VARIANT_SIZES_BASE]
  );

  const existingBySize = new Map<number, string>();
  for (const row of existingRes.rows) {
    const size = Number(row.size_base);
    if (!Number.isNaN(size)) {
      existingBySize.set(size, String(row.id));
    }
  }

  for (const sizeBase of STANDARD_VARIANT_SIZES_BASE) {
    const existingId = existingBySize.get(sizeBase);
    if (existingId) {
      await ensureSupermandiBarcode(client, existingId);
      if (storeId) {
        await client.query(
          `
          INSERT INTO retailer_variants (store_id, variant_id)
          VALUES ($1, $2)
          ON CONFLICT (store_id, variant_id) DO NOTHING
          `,
          [storeId, existingId]
        );
      }
      continue;
    }

    const variantId = randomUUID();
    const sizeLabel = formatSizeLabel(baseUnit, sizeBase);
    const variantName = `${productName} ${sizeLabel}`;

    await client.query(
      `
      INSERT INTO variants (id, product_id, name, currency, unit_base, size_base)
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [variantId, productId, variantName, currency, baseUnit, sizeBase]
    );

    await ensureSupermandiBarcode(client, variantId);
    if (storeId) {
      await client.query(
        `
        INSERT INTO retailer_variants (store_id, variant_id)
        VALUES ($1, $2)
        ON CONFLICT (store_id, variant_id) DO NOTHING
        `,
        [storeId, variantId]
      );
    }
  }
}

export async function adjustBulkInventory(params: {
  client: PoolClient;
  storeId: string;
  productId: string;
  baseUnit: BaseUnit;
  deltaBase: number;
}): Promise<void> {
  const { client, storeId, productId, baseUnit, deltaBase } = params;
  if (!Number.isFinite(deltaBase) || deltaBase === 0) return;

  const existing = await client.query(
    `SELECT base_unit FROM bulk_inventory WHERE store_id = $1 AND product_id = $2 LIMIT 1`,
    [storeId, productId]
  );
  if (existing.rows[0]?.base_unit && String(existing.rows[0].base_unit) !== baseUnit) {
    throw new Error("bulk_unit_mismatch");
  }

  await client.query(
    `
    INSERT INTO bulk_inventory (store_id, product_id, base_unit, quantity_base, created_at, updated_at)
    VALUES ($1, $2, $3, $4, NOW(), NOW())
    ON CONFLICT (store_id, product_id) DO UPDATE
    SET quantity_base = bulk_inventory.quantity_base + EXCLUDED.quantity_base,
        updated_at = NOW()
    `,
    [storeId, productId, baseUnit, Math.round(deltaBase)]
  );
}

export async function applyBulkDeductions(params: {
  client: PoolClient;
  storeId: string;
  items: Array<{ variantId: string; quantity: number }>;
}): Promise<void> {
  const { client, storeId, items } = params;
  const variantIds = Array.from(new Set(items.map((item) => item.variantId)));
  if (variantIds.length === 0) return;

  const res = await client.query(
    `
    SELECT id, product_id, unit_base, size_base
    FROM variants
    WHERE id = ANY($1::text[])
    `,
    [variantIds]
  );

  const infoByVariant = new Map<string, { productId: string; unitBase: BaseUnit | null; sizeBase: number | null }>();
  for (const row of res.rows) {
    infoByVariant.set(String(row.id), {
      productId: String(row.product_id),
      unitBase: row.unit_base ? String(row.unit_base) as BaseUnit : null,
      sizeBase: row.size_base === null || row.size_base === undefined ? null : Number(row.size_base)
    });
  }

  const byProduct = new Map<string, { baseUnit: BaseUnit; deltaBase: number }>();
  for (const item of items) {
    const info = infoByVariant.get(item.variantId);
    if (!info || !info.unitBase || !info.sizeBase) continue;
    const qty = Number.isFinite(item.quantity) ? Math.round(item.quantity) : 0;
    if (qty <= 0) continue;

    const delta = -Math.round(info.sizeBase * qty);
    const existing = byProduct.get(info.productId);
    if (existing) {
      if (existing.baseUnit !== info.unitBase) {
        throw new Error("bulk_unit_mismatch");
      }
      existing.deltaBase += delta;
    } else {
      byProduct.set(info.productId, { baseUnit: info.unitBase, deltaBase: delta });
    }
  }

  for (const [productId, payload] of byProduct.entries()) {
    await adjustBulkInventory({
      client,
      storeId,
      productId,
      baseUnit: payload.baseUnit,
      deltaBase: payload.deltaBase
    });

    // AUD-051-A FIX: Dual-write to catalog schema for dashboard consistency
    // Convert bulk delta to unit count for catalog.store_products.current_stock
    // Note: For bulk items, we track by weight/volume base, but for simplicity
    // we update current_stock as a count approximation (delta / 1000 for 1kg/1L units)
    const unitDelta = Math.round(payload.deltaBase / 1000); // Convert base units to kg/L
    if (unitDelta !== 0) {
      await client.query(
        `UPDATE catalog.store_products
         SET current_stock = GREATEST(0, current_stock + $3),
             stock_last_event_at = NOW(),
             updated_at = NOW()
         WHERE store_id = $1 AND product_id = $2`,
        [storeId, productId, unitDelta]
      );

      // Also update inventory.stock_balances for ledger consistency
      const invLedgerId = randomUUID();

      // POS-INV-002: Get stock_before for ledger entry
      const balanceResult = await client.query(
        `SELECT COALESCE(current_qty, 0) AS stock_before
         FROM inventory.stock_balances
         WHERE store_id = $1 AND product_id = $2`,
        [storeId, productId]
      );
      const stockBefore = balanceResult.rows.length > 0 ? Number(balanceResult.rows[0].stock_before) : 0;
      const stockAfter = stockBefore + unitDelta;

      // T-177: Include stock_version increment for optimistic concurrency
      await client.query(
        `INSERT INTO inventory.stock_balances (store_id, product_id, current_qty, stock_version, last_ledger_id, updated_at)
         VALUES ($1, $2, GREATEST(0, $3), 1, $4, NOW())
         ON CONFLICT (store_id, product_id) DO UPDATE SET
           current_qty = GREATEST(0, inventory.stock_balances.current_qty + $3),
           stock_version = inventory.stock_balances.stock_version + 1,
           last_ledger_id = $4,
           updated_at = NOW()`,
        [storeId, productId, unitDelta, invLedgerId]
      );

      // POS-INV-002 + POS-INV-003: Insert ledger entry with proper source column
      await client.query(
        `INSERT INTO inventory.inventory_ledger
           (id, store_id, product_id, delta_qty, transaction_type, reference_type, stock_before, stock_after, source, notes, created_at)
         VALUES ($1, $2, $3, $4, 'bulk_sale', 'sale', $5, $6, 'BULK_DEDUCTION', 'bulk sale deduction', NOW())`,
        [invLedgerId, storeId, productId, unitDelta, stockBefore, stockAfter]
      );
    }
  }
}

export async function listInventoryVariants(params: {
  client: Queryable;
  storeId: string;
  barcode?: string;
  query?: string;
}): Promise<
  Array<{
    id: string;
    name: string;
    barcode: string | null;
    sku: string | null;
    price: number;
    currency: string;
    stock: number;
  }>
> {
  const { client, storeId } = params;
  const barcode = params.barcode?.trim() || undefined;
  const query = params.query?.trim() || undefined;

  const hasVariantStock = await hasVariantStockColumn(client);
  const stockSelect = hasVariantStock ? "v.stock AS variant_stock" : "NULL::int AS variant_stock";

  const conditions: string[] = [];
  const args: any[] = [storeId];
  if (barcode) {
    args.push(barcode);
    conditions.push(
      `EXISTS (SELECT 1 FROM barcodes bq WHERE bq.variant_id = v.id AND bq.barcode = $${args.length})`
    );
  }
  if (query) {
    args.push(`%${query}%`);
    conditions.push(
      `(v.name ILIKE $${args.length} OR EXISTS (SELECT 1 FROM barcodes bq WHERE bq.variant_id = v.id AND bq.barcode ILIKE $${args.length}))`
    );
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  // CRITICAL FIX: Use LEFT JOIN instead of INNER JOIN to find variants with stock but no retailer_variants link
  // This ensures products with inventory show up even if the link is missing
  const res = await client.query(
    `
    SELECT v.id,
           v.name,
           v.currency,
           v.unit_base,
           v.size_base,
           v.product_id,
           rv.selling_price_minor,
           b.barcode AS supermandi_barcode,
           bi.base_unit AS bulk_base_unit,
           bi.quantity_base AS bulk_quantity_base,
           si.available_qty AS store_available_qty,
           ${stockSelect}
    FROM variants v
    LEFT JOIN retailer_variants rv
      ON rv.variant_id = v.id AND rv.store_id = $1::uuid
    LEFT JOIN barcodes b
      ON b.variant_id = v.id AND b.barcode_type = 'supermandi'
    LEFT JOIN bulk_inventory bi
      ON bi.store_id = $1::text AND bi.product_id = v.product_id
    LEFT JOIN store_inventory si
      ON si.store_id = $1::uuid AND si.global_product_id = v.product_id
    WHERE (bi.quantity_base IS NOT NULL OR si.available_qty IS NOT NULL OR rv.variant_id IS NOT NULL)
    ${whereClause ? `AND ${whereClause.replace('WHERE ', '')}` : ''}
    ORDER BY v.name ASC
    `,
    args
  );

  // Auto-create missing retailer_variants links (failsafe fix)
  const missingLinks: string[] = [];
  for (const row of res.rows) {
    // If variant has stock but no retailer_variants link (selling_price_minor would be NULL)
    if (row.id && (row.bulk_quantity_base != null || row.store_available_qty != null) && row.selling_price_minor == null) {
      missingLinks.push(String(row.id));
    }
  }

  if (missingLinks.length > 0) {
    // Bulk insert missing retailer_variants links
    const values = missingLinks.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2}, TRUE)`).join(", ");
    const params = missingLinks.flatMap(variantId => [storeId, variantId]);

    await client.query(
      `
      INSERT INTO retailer_variants (store_id, variant_id, digitised_by_retailer)
      VALUES ${values}
      ON CONFLICT (store_id, variant_id) DO NOTHING
      `,
      params
    );

    log.warn(`[AUTOFIXED] Created ${missingLinks.length} missing retailer_variants links for store ${storeId}`);
  }

  const legacyResults = res.rows.map((row) => {
    const availability = computeAvailabilityFromRow(row, hasVariantStock);
    const stock = availability.available ?? 0;
    const price = Number(row.selling_price_minor ?? 0);
    return {
      id: String(row.id),
      name: String(row.name ?? ""),
      barcode: row.supermandi_barcode ? String(row.supermandi_barcode) : null,
      sku: null,
      price: Number.isFinite(price) ? price : 0,
      currency: String(row.currency ?? "INR"),
      stock: Number.isFinite(stock) ? Math.max(0, Math.floor(stock)) : 0
    };
  });

  // GCP-STG-0128: Also query V3 catalog products (catalog.store_products + inventory.stock_balances)
  // These products may not exist in legacy variants/retailer_variants tables
  const legacyIds = new Set(legacyResults.map(r => r.id));
  const catalogArgs: any[] = [storeId];
  let catalogWhere = "";
  if (barcode) {
    catalogArgs.push(barcode);
    catalogWhere = ` AND (cp.barcode = $${catalogArgs.length} OR sp.barcode = $${catalogArgs.length})`;
  }
  if (query) {
    catalogArgs.push(`%${query}%`);
    catalogWhere += ` AND (cp.name ILIKE $${catalogArgs.length} OR cp.barcode ILIKE $${catalogArgs.length})`;
  }

  const catalogRes = await client.query(
    `
    SELECT sp.product_id::text AS id,
           cp.name,
           COALESCE(cp.barcode, sp.barcode) AS supermandi_barcode,
           sp.selling_price AS selling_price_minor,
           COALESCE(sb.current_qty, sp.current_stock, 0) AS catalog_stock
    FROM catalog.store_products sp
    JOIN catalog.products cp ON cp.id = sp.product_id
    LEFT JOIN inventory.stock_balances sb
      ON sb.store_id = sp.store_id AND sb.product_id = sp.product_id
    WHERE sp.store_id = $1::uuid
      AND sp.is_active = true
      ${catalogWhere}
    ORDER BY cp.name ASC
    `,
    catalogArgs
  );

  const catalogResults = catalogRes.rows
    .filter(row => !legacyIds.has(String(row.id))) // Avoid duplicates
    .map(row => {
      const stock = Number(row.catalog_stock ?? 0);
      const price = Number(row.selling_price_minor ?? 0);
      return {
        id: String(row.id),
        name: String(row.name ?? ""),
        barcode: row.supermandi_barcode ? String(row.supermandi_barcode) : null,
        sku: null,
        price: Number.isFinite(price) ? price : 0,
        currency: "INR",
        stock: Number.isFinite(stock) ? Math.max(0, Math.floor(stock)) : 0
      };
    });

  return [...legacyResults, ...catalogResults];
}

export async function ensureSaleAvailability(params: {
  client: PoolClient;
  storeId: string;
  items: Array<{ variantId: string; quantity: number }>;
}): Promise<void> {
  const { client, storeId } = params;
  const quantityByVariant = new Map<string, number>();
  for (const item of params.items) {
    const variantId = item.variantId;
    const qty = Number.isFinite(item.quantity) ? Math.round(item.quantity) : 0;
    if (!variantId || qty <= 0) continue;
    quantityByVariant.set(variantId, (quantityByVariant.get(variantId) ?? 0) + qty);
  }

  const variantIds = Array.from(quantityByVariant.keys());
  if (variantIds.length === 0) return;

  const hasVariantStock = await hasVariantStockColumn(client);
  const stockSelect = hasVariantStock ? "v.stock AS variant_stock" : "NULL::int AS variant_stock";

  // AUD-VM-033 FIX: Also join inventory.stock_balances for catalog products
  const res = await client.query(
    `
    SELECT v.id,
           v.unit_base,
           v.size_base,
           v.product_id,
           bi.base_unit AS bulk_base_unit,
           bi.quantity_base AS bulk_quantity_base,
           ${stockSelect},
           COALESCE(sb.current_qty, 0) AS catalog_stock
    FROM variants v
    JOIN retailer_variants rv
      ON rv.variant_id = v.id AND rv.store_id = $1::uuid
    LEFT JOIN bulk_inventory bi
      ON bi.store_id = $1::text AND bi.product_id = v.product_id
    LEFT JOIN inventory.stock_balances sb
      ON sb.store_id = $1::uuid
      AND sb.product_id = CASE
        WHEN v.product_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN v.product_id::uuid
        ELSE NULL
      END
    WHERE v.id = ANY($2::text[])
    FOR UPDATE OF v, rv
    `,
    [storeId, variantIds]
  );

  // GCP-STG-0125: Don't throw product_not_found for V3 catalog items that aren't
  // in legacy variants table. ensureStoreInventoryAvailability already validated catalog stock.
  // Only check stock for items that DO exist in legacy tables.
  if (res.rows.length === 0 && variantIds.length > 0) {
    // No items found at all — either all catalog items (skip) or truly missing
    // If all IDs are UUID-format, they're catalog product IDs → skip legacy check entirely
    const allUuids = variantIds.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
    if (allUuids) return; // All catalog items, already validated
    throw new Error("product_not_found");
  }

  const bulkRequiredByProduct = new Map<
    string,
    { baseUnit: BaseUnit; requiredBase: number; availableBase: number }
  >();

  for (const row of res.rows) {
    const variantId = String(row.id);
    const requiredQty = quantityByVariant.get(variantId) ?? 0;
    if (requiredQty <= 0) continue;

    const unitBase = row.unit_base ? String(row.unit_base) as BaseUnit : null;
    const sizeBase =
      row.size_base === null || row.size_base === undefined ? null : Number(row.size_base);
    const bulkUnit = row.bulk_base_unit ? String(row.bulk_base_unit) as BaseUnit : null;
    const bulkQuantity =
      row.bulk_quantity_base === null || row.bulk_quantity_base === undefined
        ? null
        : Number(row.bulk_quantity_base);

    const sizeValid = typeof sizeBase === "number" && Number.isFinite(sizeBase) && sizeBase > 0;
    const isBulkVariant = unitBase && sizeValid;

    if (isBulkVariant) {
      if (bulkUnit && bulkUnit !== unitBase) {
        throw new Error("bulk_unit_mismatch");
      }

      const bulkValid = typeof bulkQuantity === "number" && Number.isFinite(bulkQuantity);
      const availableBase = bulkValid ? Math.max(0, bulkQuantity) : 0;
      const requiredBase = Math.round(sizeBase as number) * requiredQty;
      const productId = String(row.product_id);
      const entry = bulkRequiredByProduct.get(productId);
      if (entry) {
        if (entry.baseUnit !== unitBase) {
          throw new Error("bulk_unit_mismatch");
        }
        entry.requiredBase += requiredBase;
        entry.availableBase = availableBase;
      } else {
        bulkRequiredByProduct.set(productId, {
          baseUnit: unitBase,
          requiredBase,
          availableBase
        });
      }
      continue;
    }

    // AUD-VM-033 FIX: Check BOTH variants.stock AND inventory.stock_balances (catalog)
    // If EITHER source has sufficient stock, allow the sale
    const catalogStock = Number(row.catalog_stock ?? 0);
    const catalogAvailable = Number.isFinite(catalogStock) ? Math.max(0, catalogStock) : 0;

    if (hasVariantStock) {
      // Legacy mode: variants.stock column exists, check it with catalog as fallback
      const variantStock = Number(row.variant_stock ?? 0);
      const variantAvailable = Number.isFinite(variantStock) ? Math.max(0, variantStock) : 0;
      const available = Math.max(variantAvailable, catalogAvailable);
      if (requiredQty > available) {
        throw new Error("insufficient_stock");
      }
    } else if (catalogAvailable > 0) {
      // Catalog-only mode: no variants.stock, check catalog if it has stock data
      if (requiredQty > catalogAvailable) {
        throw new Error("insufficient_stock");
      }
    }
    // If hasVariantStock is false AND no catalog entry: skip check (backward compat)
  }

  for (const entry of bulkRequiredByProduct.values()) {
    if (entry.requiredBase > entry.availableBase) {
      throw new Error("insufficient_stock");
    }
  }
}
