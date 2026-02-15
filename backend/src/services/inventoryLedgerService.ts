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
  // CL-002: Round to 3 decimal places instead of integer to support fractional variant qty
  // e.g., selling 1 pack of 500GM variant → stockQuantity = 0.5 KG (not rounded to 1)
  const rounded = Math.round(quantity * 1000) / 1000;
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

  // GO-LIVE-121: Idempotency check - prevent duplicate ledger entries for same reference
  // This prevents delta from being applied twice if the same sale is processed multiple times
  if (input.referenceId && input.referenceType) {
    const existingEntry = await input.client.query(
      `SELECT id FROM inventory_ledger
       WHERE store_id = $1 AND global_product_id = $2
         AND reference_type = $3 AND reference_id = $4
       LIMIT 1`,
      [storeId, globalProductId, input.referenceType, input.referenceId]
    );
    if (existingEntry.rows.length > 0) {
      console.log(`[InventoryLedger] GO-LIVE-121: Skipping duplicate movement for ${input.referenceType}/${input.referenceId}`);
      // Return current stock without applying delta again
      const currentRes = await input.client.query(
        `SELECT available_qty FROM store_inventory
         WHERE store_id = $1 AND global_product_id = $2`,
        [storeId, globalProductId]
      );
      const current = Math.round(Number(currentRes.rows[0]?.available_qty ?? 0));
      return { previousQty: current, nextQty: current, delta: 0 };
    }
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
  let current = Number.isFinite(Number(currentRaw)) ? Math.round(Number(currentRaw)) : 0;

  // AUD-VM-033 FIX: Also check catalog stock when store_inventory shows insufficient
  // This bridges the dual inventory systems for catalog-digitised products
  const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(globalProductId);
  if (isValidUUID) {
    const catalogRes = await input.client.query(
      `
      SELECT current_qty
      FROM inventory.stock_balances
      WHERE store_id = $1::uuid AND product_id = $2::uuid
      `,
      [storeId, globalProductId]
    );
    const catalogStock = Number(catalogRes.rows[0]?.current_qty ?? 0);
    if (Number.isFinite(catalogStock)) {
      // Use MAX of store_inventory and catalog stock
      current = Math.max(current, Math.floor(catalogStock));
    }
  }

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

  // MT-10: Dual-write to inventory.stock_balances for dashboard consistency
  // Map movement type to transaction type
  const transactionType = input.movementType === "SELL" ? "sale" :
                          input.movementType === "RECEIVE" ? "purchase_received" :
                          "adjustment";

  // Get current stock_balances entry
  const balanceResult = await input.client.query(
    `SELECT current_qty FROM inventory.stock_balances
     WHERE store_id = $1 AND product_id = $2
     FOR UPDATE`,
    [storeId, globalProductId]
  );
  const catalogStockBefore = balanceResult.rows[0]?.current_qty ?? 0;
  const catalogStockAfter = Math.max(0, catalogStockBefore + delta);

  // Insert ledger entry to inventory.inventory_ledger
  const invLedgerId = randomUUID();
  await input.client.query(
    `INSERT INTO inventory.inventory_ledger
     (id, store_id, product_id, delta_qty, transaction_type, reference_type, reference_id,
      stock_before, stock_after, unit_cost, source, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'LEGACY_LEDGER_SERVICE', $11)`,
    [
      invLedgerId,
      storeId,
      globalProductId,
      delta,
      transactionType,
      input.referenceType ?? 'manual',
      input.referenceId ?? null,
      catalogStockBefore,
      catalogStockAfter,
      unitCostMinor,
      input.reason ?? null
    ]
  );

  // Upsert stock_balances
  await input.client.query(
    `INSERT INTO inventory.stock_balances (store_id, product_id, current_qty, last_ledger_id, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (store_id, product_id) DO UPDATE SET
       current_qty = GREATEST(0, inventory.stock_balances.current_qty + $5),
       last_ledger_id = $4,
       updated_at = NOW()`,
    [storeId, globalProductId, catalogStockAfter, invLedgerId, delta]
  );

  // AUD-051-A FIX: Dual-write to catalog.store_products.current_stock for dashboard consistency
  // This ensures POS sales are reflected in the catalog schema that dashboard reads
  await input.client.query(
    `UPDATE catalog.store_products
     SET current_stock = GREATEST(0, current_stock + $3),
         stock_last_event_at = NOW(),
         updated_at = NOW()
     WHERE store_id = $1 AND product_id = $2`,
    [storeId, globalProductId, delta]
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

  // AUD-080-E FIX: Resolve all product IDs first, then sort by productId before processing
  // This ensures consistent lock acquisition order and prevents deadlocks
  const resolvedItems: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitSellMinor: number;
  }> = [];

  for (const item of params.items) {
    const info = infoByVariant.get(item.variantId);
    if (!info) continue;
    const explicitGlobalId = item.globalProductId?.trim();
    const resolvedProductId = explicitGlobalId || info.productId;
    const productName =
      item.name?.trim() || info.productName || fallbackName(resolvedProductId);
    resolvedItems.push({
      productId: resolvedProductId,
      productName,
      quantity: item.quantity,
      unitSellMinor: item.unitSellMinor
    });
  }

  // Sort by productId to prevent deadlocks
  resolvedItems.sort((a, b) => a.productId.localeCompare(b.productId));

  for (const item of resolvedItems) {
    await ensureGlobalProductEntry({
      client: params.client,
      globalProductId: item.productId,
      globalName: item.productName
    });

    await applyInventoryMovement({
      client: params.client,
      storeId: params.storeId,
      globalProductId: item.productId,
      movementType: "SELL",
      quantity: item.quantity,
      unitSellMinor: item.unitSellMinor,
      referenceType: "sale",
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
  const availableByProduct = new Map<string, number>();

  // AUD-VM-033 FIX: Check stock from both legacy store_inventory AND catalog schema
  // This bridges the two inventory systems during migration

  // 1. First check legacy store_inventory
  const legacyRes = await params.client.query(
    `
    SELECT global_product_id, available_qty
    FROM store_inventory
    WHERE store_id = $1 AND global_product_id = ANY($2::text[])
    FOR UPDATE
    `,
    [params.storeId, globalProductIds]
  );

  for (const row of legacyRes.rows) {
    const productId = String(row.global_product_id);
    const qty = Number(row.available_qty ?? 0);
    availableByProduct.set(
      productId,
      Number.isFinite(qty) ? Math.max(0, Math.floor(qty)) : 0
    );
  }

  // 2. Also check catalog schema stock (for products missing from legacy system)
  // AUD-VM-033: Bridge catalog.store_products.current_stock and inventory.stock_balances
  const catalogRes = await params.client.query(
    `
    SELECT sp.product_id::text AS product_id,
           COALESCE(sb.current_qty, sp.current_stock, 0) AS available_qty
    FROM catalog.store_products sp
    LEFT JOIN inventory.stock_balances sb
      ON sb.store_id = sp.store_id AND sb.product_id = sp.product_id
    WHERE sp.store_id = $1
      AND sp.product_id::text = ANY($2::text[])
      AND sp.is_active = true
    `,
    [params.storeId, globalProductIds]
  );

  for (const row of catalogRes.rows) {
    const productId = String(row.product_id);
    const catalogQty = Number(row.available_qty ?? 0);
    const existing = availableByProduct.get(productId) ?? 0;
    // Use MAX of legacy and catalog stock (in case both exist)
    availableByProduct.set(
      productId,
      Math.max(existing, Number.isFinite(catalogQty) ? Math.floor(catalogQty) : 0)
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

/**
 * GO-LIVE-066/067: Record sale return movements to reverse a sale
 * Creates sale_return ledger entries that add stock back
 */
export async function recordSaleReturnMovements(params: {
  client: PoolClient;
  storeId: string;
  saleId: string;
  returnId: string;
  items: LedgerSaleItem[];
  reason?: string;
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

  // Sort by productId to prevent deadlocks (consistent lock order)
  const resolvedItems: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitSellMinor: number;
  }> = [];

  for (const item of params.items) {
    const info = infoByVariant.get(item.variantId);
    if (!info) continue;
    const explicitGlobalId = item.globalProductId?.trim();
    const resolvedProductId = explicitGlobalId || info.productId;
    const productName =
      item.name?.trim() || info.productName || fallbackName(resolvedProductId);
    resolvedItems.push({
      productId: resolvedProductId,
      productName,
      quantity: item.quantity,
      unitSellMinor: item.unitSellMinor
    });
  }

  resolvedItems.sort((a, b) => a.productId.localeCompare(b.productId));

  for (const item of resolvedItems) {
    await ensureGlobalProductEntry({
      client: params.client,
      globalProductId: item.productId,
      globalName: item.productName
    });

    // Use ADJUSTMENT movement type with positive quantity to add stock back
    // The delta will be positive (adding stock)
    const storeId = params.storeId.trim();
    const globalProductId = item.productId.trim();
    const quantity = Math.abs(Math.round(item.quantity));

    // Insert store_inventory record if not exists
    await params.client.query(
      `INSERT INTO store_inventory (store_id, global_product_id, available_qty)
       VALUES ($1, $2, $3)
       ON CONFLICT (store_id, global_product_id) DO NOTHING`,
      [storeId, globalProductId, 0]
    );

    // Get current stock
    const inventoryRes = await params.client.query(
      `SELECT available_qty FROM store_inventory
       WHERE store_id = $1 AND global_product_id = $2
       FOR UPDATE`,
      [storeId, globalProductId]
    );

    const currentRaw = inventoryRes.rows[0]?.available_qty ?? 0;
    const current = Number.isFinite(Number(currentRaw)) ? Math.round(Number(currentRaw)) : 0;
    const nextQty = current + quantity;

    // Update store_inventory
    await params.client.query(
      `UPDATE store_inventory
       SET available_qty = $3, updated_at = NOW()
       WHERE store_id = $1 AND global_product_id = $2`,
      [storeId, globalProductId, nextQty]
    );

    // Record in legacy inventory_ledger
    await params.client.query(
      `INSERT INTO inventory_ledger (
        id, store_id, global_product_id, movement_type, quantity,
        unit_sell_minor, reason, reference_type, reference_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        randomUUID(),
        storeId,
        globalProductId,
        "ADJUSTMENT", // Using ADJUSTMENT since we're adding stock back
        quantity,
        item.unitSellMinor,
        params.reason ?? `Return for sale ${params.saleId}`,
        "return",
        params.returnId
      ]
    );

    // Get catalog stock balance
    const balanceResult = await params.client.query(
      `SELECT current_qty FROM inventory.stock_balances
       WHERE store_id = $1 AND product_id = $2
       FOR UPDATE`,
      [storeId, globalProductId]
    );
    const catalogStockBefore = balanceResult.rows[0]?.current_qty ?? 0;
    const catalogStockAfter = catalogStockBefore + quantity;

    // T-062: Find original sale ledger entry for reversal chain tracking
    const originalLedgerRes = await params.client.query(
      `SELECT id FROM inventory.inventory_ledger
       WHERE store_id = $1 AND product_id = $2
         AND reference_type = 'sale' AND reference_id = $3
         AND transaction_type = 'sale'
       ORDER BY created_at DESC LIMIT 1`,
      [storeId, globalProductId, params.saleId]
    );
    const originalLedgerId = originalLedgerRes.rows[0]?.id ?? null;

    // Insert into inventory.inventory_ledger with sale_return type
    const invLedgerId = randomUUID();
    await params.client.query(
      `INSERT INTO inventory.inventory_ledger
       (id, store_id, product_id, delta_qty, transaction_type, reference_type, reference_id,
        stock_before, stock_after, unit_cost, source, notes, reversal_of_id)
       VALUES ($1, $2, $3, $4, 'sale_return', 'return', $5, $6, $7, $8, 'RETURN_SERVICE', $9, $10)`,
      [
        invLedgerId,
        storeId,
        globalProductId,
        quantity, // Positive delta to add stock
        params.returnId,
        catalogStockBefore,
        catalogStockAfter,
        item.unitSellMinor,
        params.reason ?? `Return for sale ${params.saleId}`,
        originalLedgerId
      ]
    );

    // T-062: Mark original sale entry as reversed
    if (originalLedgerId) {
      await params.client.query(
        `UPDATE inventory.inventory_ledger
         SET reversed_by_id = $1, reversed_at = NOW()
         WHERE id = $2 AND reversed_by_id IS NULL`,
        [invLedgerId, originalLedgerId]
      );
    }

    // Upsert stock_balances
    await params.client.query(
      `INSERT INTO inventory.stock_balances (store_id, product_id, current_qty, last_ledger_id, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (store_id, product_id) DO UPDATE SET
         current_qty = inventory.stock_balances.current_qty + $5,
         last_ledger_id = $4,
         updated_at = NOW()`,
      [storeId, globalProductId, catalogStockAfter, invLedgerId, quantity]
    );

    // Update catalog.store_products denormalized stock
    await params.client.query(
      `UPDATE catalog.store_products
       SET current_stock = current_stock + $3,
           stock_last_event_at = NOW(),
           updated_at = NOW()
       WHERE store_id = $1 AND product_id = $2`,
      [storeId, globalProductId, quantity]
    );
  }
}
