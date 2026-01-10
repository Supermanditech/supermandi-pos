import { randomUUID } from "crypto";
import type { PoolClient } from "pg";

export type InventoryMovementType = "RECEIVE" | "SELL" | "ADJUSTMENT";

export type InventoryMovementInput = {
  client: PoolClient;
  storeId: string;
  globalProductId: string;
  movementType: InventoryMovementType;
  quantity: number;
  unitCostMinor?: number | null;
  unitSellMinor?: number | null;
  reason?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
};

export type LedgerSaleItem = {
  variantId: string;
  quantity: number;
  unitSellMinor: number;
  name?: string | null;
  globalProductId?: string | null;
};

export type InsufficientStockDetail = {
  skuId: string;
  available: number;
  required: number;
  name?: string | null;
  message: string;
};

export class InsufficientStockError extends Error {
  details: InsufficientStockDetail[];

  constructor(details: InsufficientStockDetail[]) {
    super("insufficient_stock");
    this.name = "InsufficientStockError";
    this.details = details;
  }
}

const fallbackName = (id: string): string => `Item ${id.slice(-4) || id}`;

const normalizeMinor = (value: number | null | undefined, field: string): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`invalid_${field}`);
  }
  const rounded = Math.round(value);
  if (rounded <= 0) {
    throw new Error(`invalid_${field}`);
  }
  return rounded;
};

const normalizeDelta = (movementType: InventoryMovementType, quantity: number): number => {
  if (typeof quantity !== "number" || !Number.isFinite(quantity)) {
    throw new Error("invalid_quantity");
  }
  const rounded = Math.round(quantity);
  if (rounded === 0) {
    throw new Error("invalid_quantity");
  }

  if (movementType === "RECEIVE") {
    return Math.abs(rounded);
  }
  if (movementType === "SELL") {
    return -Math.abs(rounded);
  }
  return rounded;
};

export async function ensureGlobalProductEntry(params: {
  client: PoolClient;
  globalProductId: string;
  globalName?: string | null;
}): Promise<void> {
  const globalProductId = params.globalProductId.trim();
  if (!globalProductId) {
    throw new Error("global_product_id_required");
  }
  const globalName = params.globalName?.trim() || fallbackName(globalProductId);
  await params.client.query(
    `
    INSERT INTO global_products (id, global_name, category)
    VALUES ($1, $2, $3)
    ON CONFLICT (id) DO NOTHING
    `,
    [globalProductId, globalName, null]
  );
}

export async function applyInventoryMovement(
  input: InventoryMovementInput
): Promise<{ previousQty: number; nextQty: number; delta: number }> {
  const storeId = input.storeId.trim();
  const globalProductId = input.globalProductId.trim();
  if (!storeId || !globalProductId) {
    throw new Error("store_or_product_missing");
  }

  const delta = normalizeDelta(input.movementType, input.quantity);
  const unitCostMinor = normalizeMinor(input.unitCostMinor ?? null, "unit_cost_minor");
  const unitSellMinor = normalizeMinor(input.unitSellMinor ?? null, "unit_sell_minor");

  await input.client.query(
    `
    INSERT INTO store_inventory (store_id, global_product_id, available_qty)
    VALUES ($1, $2, $3)
    ON CONFLICT (store_id, global_product_id) DO NOTHING
    `,
    [storeId, globalProductId, 0]
  );

  const inventoryRes = await input.client.query(
    `
    SELECT available_qty
    FROM store_inventory
    WHERE store_id = $1 AND global_product_id = $2
    FOR UPDATE
    `,
    [storeId, globalProductId]
  );

  const currentRaw = inventoryRes.rows[0]?.available_qty ?? 0;
  const current = Number.isFinite(Number(currentRaw)) ? Math.round(Number(currentRaw)) : 0;
  const nextQty = current + delta;
  if (nextQty < 0) {
    throw new Error("insufficient_stock");
  }

  await input.client.query(
    `
    UPDATE store_inventory
    SET available_qty = $3,
        updated_at = NOW()
    WHERE store_id = $1 AND global_product_id = $2
    `,
    [storeId, globalProductId, nextQty]
  );

  await input.client.query(
    `
    INSERT INTO inventory_ledger (
      id,
      store_id,
      global_product_id,
      movement_type,
      quantity,
      unit_cost_minor,
      unit_sell_minor,
      reason,
      reference_type,
      reference_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `,
    [
      randomUUID(),
      storeId,
      globalProductId,
      input.movementType,
      delta,
      unitCostMinor,
      unitSellMinor,
      input.reason ?? null,
      input.referenceType ?? null,
      input.referenceId ?? null
    ]
  );

  return { previousQty: current, nextQty, delta };
}

export async function fetchLedgerStock(params: {
  client: PoolClient;
  storeId: string;
  globalProductId: string;
}): Promise<number> {
  const storeId = params.storeId.trim();
  const globalProductId = params.globalProductId.trim();
  if (!storeId || !globalProductId) {
    throw new Error("store_or_product_missing");
  }

  const res = await params.client.query(
    `
    SELECT COALESCE(SUM(quantity), 0) AS stock
    FROM inventory_ledger
    WHERE store_id = $1 AND global_product_id = $2
    `,
    [storeId, globalProductId]
  );
  const raw = res.rows[0]?.stock ?? 0;
  return Number.isFinite(Number(raw)) ? Math.round(Number(raw)) : 0;
}

export async function recordSaleInventoryMovements(params: {
  client: PoolClient;
  storeId: string;
  saleId: string;
  items: LedgerSaleItem[];
}): Promise<void> {
  const variantIds = Array.from(
    new Set(
      params.items
        .map((item) => item.variantId)
        .filter((variantId) => typeof variantId === "string" && variantId.trim().length > 0)
    )
  );
  if (variantIds.length === 0) return;

  const variantRes = await params.client.query(
    `
    SELECT v.id AS variant_id,
           v.product_id,
           COALESCE(p.name, v.name) AS product_name
    FROM variants v
    LEFT JOIN products p ON p.id = v.product_id
    WHERE v.id = ANY($1::text[])
    `,
    [variantIds]
  );

  const infoByVariant = new Map<string, { productId: string; productName: string }>();
  for (const row of variantRes.rows) {
    const variantId = String(row.variant_id);
    infoByVariant.set(variantId, {
      productId: String(row.product_id),
      productName: String(row.product_name ?? "")
    });
  }

  for (const item of params.items) {
    const info = infoByVariant.get(item.variantId);
    if (!info) continue;
    const explicitGlobalId = item.globalProductId?.trim();
    const resolvedProductId = explicitGlobalId || info.productId;
    const productName =
      item.name?.trim() || info.productName || fallbackName(resolvedProductId);
    await ensureGlobalProductEntry({
      client: params.client,
      globalProductId: resolvedProductId,
      globalName: productName
    });

    await applyInventoryMovement({
      client: params.client,
      storeId: params.storeId,
      globalProductId: resolvedProductId,
      movementType: "SELL",
      quantity: item.quantity,
      unitSellMinor: item.unitSellMinor,
      referenceType: "SALE",
      referenceId: params.saleId
    });
  }
}

export async function ensureStoreInventoryAvailability(params: {
  client: PoolClient;
  storeId: string;
  items: Array<{
    variantId: string;
    quantity: number;
    globalProductId?: string | null;
    name?: string | null;
  }>;
}): Promise<void> {
  const requiredByProduct = new Map<string, { required: number; name?: string | null }>();
  const quantityByVariant = new Map<string, number>();

  for (const item of params.items) {
    const quantity = Math.round(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    const globalProductId = item.globalProductId?.trim();
    if (globalProductId) {
      const entry = requiredByProduct.get(globalProductId);
      if (entry) {
        entry.required += quantity;
      } else {
        requiredByProduct.set(globalProductId, { required: quantity, name: item.name ?? null });
      }
      continue;
    }
    const variantId = item.variantId?.trim();
    if (variantId) {
      quantityByVariant.set(variantId, (quantityByVariant.get(variantId) ?? 0) + quantity);
    }
  }

  if (quantityByVariant.size > 0) {
    const variantIds = Array.from(quantityByVariant.keys());
    const variantRes = await params.client.query(
      `
      SELECT v.id AS variant_id,
             v.product_id,
             COALESCE(p.name, v.name) AS product_name
      FROM variants v
      LEFT JOIN products p ON p.id = v.product_id
      WHERE v.id = ANY($1::text[])
      `,
      [variantIds]
    );

    for (const row of variantRes.rows) {
      const productId = String(row.product_id);
      const productName = String(row.product_name ?? "");
      const quantity = quantityByVariant.get(String(row.variant_id)) ?? 0;
      if (!quantity) continue;
      const entry = requiredByProduct.get(productId);
      if (entry) {
        entry.required += quantity;
        if (!entry.name && productName) {
          entry.name = productName;
        }
      } else {
        requiredByProduct.set(productId, { required: quantity, name: productName });
      }
    }
  }

  if (requiredByProduct.size === 0) return;

  const globalProductIds = Array.from(requiredByProduct.keys()).sort();
  const res = await params.client.query(
    `
    SELECT global_product_id, available_qty
    FROM store_inventory
    WHERE store_id = $1 AND global_product_id = ANY($2::text[])
    FOR UPDATE
    `,
    [params.storeId, globalProductIds]
  );

  const availableByProduct = new Map<string, number>();
  for (const row of res.rows) {
    const productId = String(row.global_product_id);
    const qty = Number(row.available_qty ?? 0);
    availableByProduct.set(
      productId,
      Number.isFinite(qty) ? Math.max(0, Math.floor(qty)) : 0
    );
  }

  const failures: InsufficientStockDetail[] = [];
  for (const [productId, payload] of requiredByProduct.entries()) {
    const available = availableByProduct.get(productId) ?? 0;
    if (payload.required > available) {
      failures.push({
        skuId: productId,
        available,
        required: payload.required,
        name: payload.name ?? null,
        message: `Stock changed. Available: ${available}`
      });
    }
  }

  if (failures.length > 0) {
    throw new InsufficientStockError(failures);
  }
}
