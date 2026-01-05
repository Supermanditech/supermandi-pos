import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import {
  adjustBulkInventory,
  attachBarcodeToVariant,
  computeBaseQuantity,
  ensureStandardVariants,
  ensureSupermandiBarcode,
  isBulkQuantity,
  isSupermandiBarcode,
  type BaseUnit
} from "./inventoryService";

export type PurchaseItemInput = {
  barcode?: string;
  productId?: string;
  productName?: string;
  quantity: number;
  unit?: string | null;
  unitCostMinor: number;
  currency?: string | null;
};

export type PurchaseInput = {
  purchaseId?: string;
  supplierName?: string | null;
  currency?: string | null;
  items: PurchaseItemInput[];
};

type ResolvedItem = {
  productId: string;
  productName: string;
  variantId: string | null;
  quantity: number;
  unit: string | null;
  quantityBase: number | null;
  baseUnit: BaseUnit | null;
  isBulk: boolean;
  unitCostMinor: number;
  lineTotalMinor: number;
  currency: string;
};

function buildProductName(seed: string): string {
  const suffix = seed.slice(-4);
  return `Item ${suffix || seed}`;
}

function formatSizeLabel(baseUnit: BaseUnit, sizeBase: number): string {
  if (baseUnit === "g") {
    return sizeBase === 1000 ? "1kg" : `${sizeBase}g`;
  }
  return sizeBase === 1000 ? "1l" : `${sizeBase}ml`;
}

async function createProduct(params: {
  client: PoolClient;
  name: string;
}): Promise<{ productId: string; name: string }> {
  const productId = randomUUID();
  await params.client.query(
    `
    INSERT INTO products (id, name, category, retailer_status, enrichment_status)
    VALUES ($1, $2, $3, $4, $5)
    `,
    [productId, params.name, null, "retailer_created", "pending_enrichment"]
  );
  return { productId, name: params.name };
}

async function createVariant(params: {
  client: PoolClient;
  productId: string;
  name: string;
  currency: string;
  baseUnit?: BaseUnit | null;
  sizeBase?: number | null;
}): Promise<string> {
  const variantId = randomUUID();
  await params.client.query(
    `
    INSERT INTO variants (id, product_id, name, currency, unit_base, size_base)
    VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [variantId, params.productId, params.name, params.currency, params.baseUnit ?? null, params.sizeBase ?? null]
  );
  return variantId;
}

async function resolveVariantByBarcode(
  client: PoolClient,
  barcode: string
): Promise<{ variantId: string; productId: string; productName: string; currency: string } | null> {
  const trimmed = barcode.trim();
  const lookupBarcode = isSupermandiBarcode(trimmed) ? trimmed.toUpperCase() : trimmed;
  const res = await client.query(
    `
    SELECT v.id AS variant_id, v.product_id, v.currency, p.name AS product_name
    FROM barcodes b
    JOIN variants v ON v.id = b.variant_id
    JOIN products p ON p.id = v.product_id
    WHERE b.barcode = $1
    LIMIT 1
    `,
    [lookupBarcode]
  );

  if (!res.rows[0]) return null;
  return {
    variantId: String(res.rows[0].variant_id),
    productId: String(res.rows[0].product_id),
    productName: String(res.rows[0].product_name),
    currency: String(res.rows[0].currency ?? "INR")
  };
}

async function updateVariantSizeIfMissing(params: {
  client: PoolClient;
  variantId: string;
  baseUnit: BaseUnit;
  sizeBase: number;
}): Promise<void> {
  const res = await params.client.query(
    `SELECT unit_base, size_base FROM variants WHERE id = $1`,
    [params.variantId]
  );
  const row = res.rows[0];
  if (!row) return;
  const currentUnit = row.unit_base ? String(row.unit_base) : null;
  const currentSize = row.size_base === null || row.size_base === undefined ? null : Number(row.size_base);
  if (currentUnit && currentUnit !== params.baseUnit) return;
  if (currentSize !== null && currentSize !== params.sizeBase) return;
  if (currentUnit && currentSize !== null) return;

  await params.client.query(
    `
    UPDATE variants
    SET unit_base = COALESCE(unit_base, $2),
        size_base = COALESCE(size_base, $3),
        updated_at = NOW()
    WHERE id = $1
    `,
    [params.variantId, params.baseUnit, params.sizeBase]
  );
}

async function resolvePurchaseItem(params: {
  client: PoolClient;
  item: PurchaseItemInput;
}): Promise<ResolvedItem> {
  const { client, item } = params;
  const quantity = Math.round(item.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("invalid_quantity");
  }

  const unitCostMinor = Math.round(item.unitCostMinor);
  if (!Number.isFinite(unitCostMinor) || unitCostMinor <= 0) {
    throw new Error("invalid_unit_cost");
  }

  const unit = item.unit?.trim() || null;
  const baseInfo = computeBaseQuantity(quantity, unit);
  const baseUnit = baseInfo?.baseUnit ?? null;
  const quantityBase = baseInfo?.quantityBase ?? null;
  const isBulk = quantityBase !== null && isBulkQuantity(quantityBase);

  let productId: string;
  let productName: string;
  let variantId: string | null = null;
  let currency = item.currency?.trim() || "INR";

  const barcode = item.barcode?.trim();
  if (barcode) {
    const existing = await resolveVariantByBarcode(client, barcode);
    if (existing) {
      productId = existing.productId;
      productName = existing.productName;
      variantId = existing.variantId;
      currency = existing.currency;
    } else {
      productName = item.productName?.trim() || buildProductName(barcode);
      const created = await createProduct({ client, name: productName });
      productId = created.productId;
      const sizeLabel = baseUnit && quantityBase !== null ? formatSizeLabel(baseUnit, quantityBase) : "";
      const variantName = sizeLabel ? `${productName} ${sizeLabel}` : productName;
      variantId = await createVariant({
        client,
        productId,
        name: variantName,
        currency,
        baseUnit,
        sizeBase: quantityBase
      });
      await attachBarcodeToVariant(client, barcode, variantId);
    }
  } else if (item.productId) {
    const res = await client.query(`SELECT id, name FROM products WHERE id = $1`, [item.productId]);
    const row = res.rows[0];
    if (!row) {
      throw new Error("product_not_found");
    }
    productId = String(row.id);
    productName = String(row.name);
  } else if (item.productName) {
    productName = item.productName.trim();
    const created = await createProduct({ client, name: productName });
    productId = created.productId;
  } else {
    throw new Error("invalid_item");
  }

  if (variantId && barcode) {
    await attachBarcodeToVariant(client, barcode, variantId);
  }

  if (variantId && baseUnit && quantityBase !== null) {
    await updateVariantSizeIfMissing({ client, variantId, baseUnit, sizeBase: quantityBase });
  }

  return {
    productId,
    productName,
    variantId,
    quantity,
    unit,
    quantityBase,
    baseUnit,
    isBulk,
    unitCostMinor,
    lineTotalMinor: unitCostMinor * quantity,
    currency
  };
}

export async function createPurchase(params: {
  client: PoolClient;
  storeId: string;
  input: PurchaseInput;
  skipIfExists?: boolean;
}): Promise<{ purchaseId: string; totalMinor: number; currency: string }> {
  const { client, storeId, input, skipIfExists } = params;

  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("items_required");
  }

  const purchaseId = input.purchaseId?.trim() || randomUUID();
  if (skipIfExists) {
    const existing = await client.query(`SELECT id, total_minor, currency FROM purchases WHERE id = $1`, [purchaseId]);
    if (existing.rows[0]) {
      return {
        purchaseId,
        totalMinor: Number(existing.rows[0].total_minor ?? 0),
        currency: String(existing.rows[0].currency ?? "INR")
      };
    }
  }

  const resolvedItems: ResolvedItem[] = [];
  for (const item of input.items) {
    resolvedItems.push(await resolvePurchaseItem({ client, item }));
  }

  const currency =
    input.currency?.trim() ||
    resolvedItems.find((item) => item.currency)?.currency ||
    "INR";

  const totalMinor = resolvedItems.reduce((sum, item) => sum + item.lineTotalMinor, 0);
  const supplierName = input.supplierName?.trim() || null;

  await client.query(
    `
    INSERT INTO purchases (id, store_id, supplier_name, total_minor, currency)
    VALUES ($1, $2, $3, $4, $5)
    `,
    [purchaseId, storeId, supplierName, totalMinor, currency]
  );

  for (const item of resolvedItems) {
    await client.query(
      `
      INSERT INTO purchase_items (
        id,
        purchase_id,
        product_id,
        variant_id,
        sku,
        quantity,
        unit,
        quantity_base,
        unit_cost_minor,
        line_total_minor
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        randomUUID(),
        purchaseId,
        item.productId,
        item.variantId,
        null,
        item.quantity,
        item.unit,
        item.quantityBase,
        item.unitCostMinor,
        item.lineTotalMinor
      ]
    );

    if (item.isBulk && item.baseUnit && item.quantityBase !== null) {
      await adjustBulkInventory({
        client,
        storeId,
        productId: item.productId,
        baseUnit: item.baseUnit,
        deltaBase: item.quantityBase
      });
      await ensureStandardVariants({
        client,
        productId: item.productId,
        productName: item.productName,
        currency,
        baseUnit: item.baseUnit
      });
    }
  }

  return { purchaseId, totalMinor, currency };
}
