import { randomUUID } from "crypto";
import type { PoolClient } from "pg";

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
      ON rv.variant_id = v.id AND rv.store_id = $1
    LEFT JOIN barcodes b
      ON b.variant_id = v.id AND b.barcode_type = 'supermandi'
    LEFT JOIN bulk_inventory bi
      ON bi.store_id = $1 AND bi.product_id = v.product_id
    LEFT JOIN store_inventory si
      ON si.store_id = $1 AND si.global_product_id = v.product_id
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

    console.warn(`[AUTOFIXED] Created ${missingLinks.length} missing retailer_variants links for store ${storeId}`);
  }

  return res.rows.map((row) => {
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

  const res = await client.query(
    `
    SELECT v.id,
           v.unit_base,
           v.size_base,
           v.product_id,
           bi.base_unit AS bulk_base_unit,
           bi.quantity_base AS bulk_quantity_base,
           ${stockSelect}
    FROM variants v
    JOIN retailer_variants rv
      ON rv.variant_id = v.id AND rv.store_id = $1
    LEFT JOIN bulk_inventory bi
      ON bi.store_id = $1 AND bi.product_id = v.product_id
    WHERE v.id = ANY($2::text[])
    FOR UPDATE OF bi
    `,
    [storeId, variantIds]
  );

  if (res.rows.length !== variantIds.length) {
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

    if (hasVariantStock) {
      const stock = Number(row.variant_stock ?? 0);
      const available = Number.isFinite(stock) ? Math.max(0, stock) : 0;
      if (requiredQty > available) {
        throw new Error("insufficient_stock");
      }
    }
  }

  for (const entry of bulkRequiredByProduct.values()) {
    if (entry.requiredBase > entry.availableBase) {
      throw new Error("insufficient_stock");
    }
  }
}
