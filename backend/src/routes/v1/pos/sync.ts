import { randomUUID } from "crypto";
import { Router } from "express";
import type { PoolClient } from "pg";
import { getPool } from "../../../db/client";
import { requireDeviceToken } from "../../../middleware/deviceToken";
import {
  applyBulkDeductions,
  ensureSaleAvailability,
  attachBarcodeToVariant,
  isSupermandiBarcode
} from "../../../services/inventoryService";
import {
  recordSaleInventoryMovements,
  ensureStoreInventoryAvailability,
  InsufficientStockError
} from "../../../services/inventoryLedgerService";
import { createPurchase, type PurchaseItemInput } from "../../../services/purchaseService";

export const posSyncRouter = Router();

type SyncEvent = {
  eventId?: unknown;
  type?: unknown;
  payload?: unknown;
  createdAt?: unknown;
};

type SyncResult = {
  eventId: string;
  status: "applied" | "duplicate_ignored" | "rejected";
  error?: string;
};

function asTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function buildBillRef(): string {
  // Use full timestamp + cryptographically secure random bytes to avoid collisions
  const ts = Date.now().toString();
  const randomBytes = require("crypto").randomBytes(3); // 3 bytes = 24 bits
  const rand = randomBytes.readUIntBE(0, 3).toString(36).toUpperCase().padStart(5, '0');
  return `${ts.slice(-8)}${rand}`; // 8-digit timestamp + 5-char random = 13 chars
}

// ============================================================================
// LEGACY FUNCTION - Used by SALE_CREATED for backward compatibility
// TODO: Migrate SALE_CREATED to catalog schema in MT-6
// ============================================================================
async function ensureProductByBarcode(
  client: PoolClient,
  params: {
    barcode: string;
    name?: string | null;
    currency?: string | null;
  }
): Promise<string> {
  const rawBarcode = params.barcode.trim();
  const lookupBarcode = isSupermandiBarcode(rawBarcode) ? rawBarcode.toUpperCase() : rawBarcode;

  // AUD-056-A FIX: Check for existing active variant (join through products to check is_active)
  const existing = await client.query(
    `SELECT b.variant_id, v.product_id, p.retailer_status
     FROM barcodes b
     JOIN variants v ON v.id = b.variant_id
     JOIN products p ON p.id = v.product_id
     WHERE b.barcode = $1`,
    [lookupBarcode]
  );

  if (existing.rows[0]?.variant_id) {
    // AUD-056-A FIX: If product was soft-deleted, reactivate it instead of creating duplicate
    if (existing.rows[0].retailer_status === 'deleted' || existing.rows[0].retailer_status === 'inactive') {
      await client.query(
        `UPDATE products SET retailer_status = 'retailer_created', updated_at = NOW() WHERE id = $1`,
        [existing.rows[0].product_id]
      );
      console.log(`[Sync] Reactivated soft-deleted product for barcode ${lookupBarcode}`);
    }
    return existing.rows[0].variant_id as string;
  }

  const productId = randomUUID();
  const variantId = randomUUID();
  const suffix = rawBarcode.slice(-4);
  const name = params.name?.trim() || `Item ${suffix || rawBarcode}`;
  const currency = params.currency?.trim() || "INR";

  await client.query(
    `
    INSERT INTO products (id, name, category, retailer_status, enrichment_status)
    VALUES ($1, $2, $3, $4, $5)
    `,
    [productId, name, null, "retailer_created", "pending_enrichment"]
  );

  await client.query(
    `
    INSERT INTO variants (id, product_id, name, currency)
    VALUES ($1, $2, $3, $4)
    `,
    [variantId, productId, name, currency]
  );

  try {
    await attachBarcodeToVariant(client, rawBarcode, variantId);
  } catch (error) {
    await client.query(`DELETE FROM variants WHERE id = $1`, [variantId]);
    await client.query(`DELETE FROM products WHERE id = $1`, [productId]);
    const fallback = await client.query(`SELECT variant_id FROM barcodes WHERE barcode = $1`, [lookupBarcode]);
    if (fallback.rows[0]?.variant_id) {
      return fallback.rows[0].variant_id as string;
    }
    throw error;
  }

  return variantId;
}

// ============================================================================
// CATALOG FUNCTIONS - MT-3: Write to catalog schema instead of legacy tables
// ============================================================================

/**
 * Ensure product exists in catalog schema for offline sync
 * MT-3: Writes to catalog.products, catalog.store_products, catalog.store_product_barcodes
 * Uses LWW timestamp from event.createdAt for conflict resolution
 */
async function ensureCatalogProduct(
  client: PoolClient,
  params: {
    storeId: string;
    barcode: string;
    name?: string | null;
    eventCreatedAt?: string | null; // ISO timestamp from offline event for LWW
  }
): Promise<{ productId: string; storeProductId: string }> {
  const normalizedBarcode = params.barcode.trim();
  const productName = params.name?.trim() || `Item ${normalizedBarcode.slice(-4) || normalizedBarcode}`;

  // Parse event timestamp for LWW (when the offline event was created)
  const eventTimestamp = params.eventCreatedAt ? new Date(params.eventCreatedAt) : null;
  const validEventTimestamp = eventTimestamp && !isNaN(eventTimestamp.getTime()) ? eventTimestamp : null;

  // AUD-056-A/D FIX: Check if barcode already exists (including soft-deleted products)
  // This prevents creating duplicate products when POS sells a soft-deleted item
  const existingMapping = await client.query(
    `SELECT sp.id AS store_product_id, sp.product_id, sp.is_active
     FROM catalog.store_product_barcodes spb
     JOIN catalog.store_products sp ON sp.id = spb.store_product_id AND sp.store_id = spb.store_id
     WHERE spb.store_id = $1 AND spb.barcode = $2
     LIMIT 1`,
    [params.storeId, normalizedBarcode]
  );

  if (existingMapping.rows[0]) {
    const { store_product_id, product_id, is_active } = existingMapping.rows[0];

    // AUD-056-A FIX: If product was soft-deleted, reactivate it instead of creating duplicate
    if (!is_active) {
      await client.query(
        `UPDATE catalog.store_products SET is_active = true, updated_at = NOW() WHERE id = $1`,
        [store_product_id]
      );
      console.log(`[Sync] Reactivated soft-deleted catalog product for barcode ${normalizedBarcode}`);
    }

    return {
      productId: product_id,
      storeProductId: store_product_id
    };
  }

  // Step 2: Check if barcode exists in catalog.products (global catalog)
  let productId: string;
  const existingProduct = await client.query(
    `SELECT id FROM catalog.products WHERE primary_barcode = $1 LIMIT 1`,
    [normalizedBarcode]
  );

  if (existingProduct.rows[0]) {
    productId = existingProduct.rows[0].id;
  } else {
    // Create new catalog.products entry (capture RETURNING id for ON CONFLICT case)
    const newProductId = randomUUID();
    const insertResult = await client.query(
      `INSERT INTO catalog.products (id, name, primary_barcode, is_active)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (primary_barcode) WHERE primary_barcode IS NOT NULL
       DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      [newProductId, productName, normalizedBarcode]
    );
    // Use returned id (works for both INSERT and ON CONFLICT cases)
    productId = insertResult.rows[0]?.id || newProductId;
  }

  // Step 3: Auto-assign taxonomy based on product name
  const taxonomyResult = await client.query(
    `SELECT catalog.assign_taxonomy_by_name($1) AS taxonomy_id`,
    [productName]
  );
  const taxonomyId = taxonomyResult.rows[0]?.taxonomy_id || null;

  // Step 4: Create or update catalog.store_products with LWW guard
  const storeProductId = randomUUID();

  // MT-3: Use event timestamp for metadata_updated_at (LWW from offline event)
  // If no event timestamp, use NOW()
  const metadataTimestamp = validEventTimestamp ? validEventTimestamp.toISOString() : null;

  await client.query(
    `INSERT INTO catalog.store_products (
       id, store_id, product_id, display_name, is_active, current_stock, taxonomy_id,
       metadata_updated_at, metadata_updated_by, digitisation_mode
     )
     VALUES ($1, $2, $3, $4, true, 0, $5, COALESCE($6::timestamptz, NOW()), 'POS_SYNC', 'offline')
     ON CONFLICT (store_id, product_id) DO UPDATE SET
       display_name = CASE
         WHEN catalog.store_products.metadata_updated_at IS NULL
              OR ($6::timestamptz IS NOT NULL AND catalog.store_products.metadata_updated_at < $6::timestamptz)
         THEN COALESCE(EXCLUDED.display_name, catalog.store_products.display_name)
         ELSE catalog.store_products.display_name
       END,
       taxonomy_id = COALESCE(catalog.store_products.taxonomy_id, EXCLUDED.taxonomy_id),
       is_active = true,
       updated_at = NOW()`,
    [storeProductId, params.storeId, productId, productName, taxonomyId, metadataTimestamp]
  );

  // Get the actual store_product_id (might be existing if ON CONFLICT triggered)
  const storeProductResult = await client.query(
    `SELECT id FROM catalog.store_products WHERE store_id = $1 AND product_id = $2`,
    [params.storeId, productId]
  );
  const actualStoreProductId = storeProductResult.rows[0]?.id || storeProductId;

  // Step 5: Create store-scoped barcode binding
  await client.query(
    `INSERT INTO catalog.store_product_barcodes (store_id, store_product_id, barcode, source)
     VALUES ($1, $2, $3, 'retailer_digitisation')
     ON CONFLICT (store_id, barcode) DO NOTHING`,
    [params.storeId, actualStoreProductId, normalizedBarcode]
  );

  return { productId, storeProductId: actualStoreProductId };
}

/**
 * Update sell price in catalog.store_products with LWW
 * MT-3 Iteration 2: Writes to catalog schema instead of retailer_variants
 */
async function upsertCatalogPrice(
  client: PoolClient,
  params: {
    storeId: string;
    storeProductId: string;
    priceMinor: number;
    eventCreatedAt?: string | null; // LWW timestamp from offline event
  }
): Promise<void> {
  // Parse event timestamp for LWW
  const eventTimestamp = params.eventCreatedAt ? new Date(params.eventCreatedAt) : null;
  const validEventTimestamp = eventTimestamp && !isNaN(eventTimestamp.getTime()) ? eventTimestamp : null;
  const metadataTimestamp = validEventTimestamp ? validEventTimestamp.toISOString() : null;

  // Update sell_price with LWW guard
  await client.query(
    `UPDATE catalog.store_products
     SET sell_price = CASE
           WHEN metadata_updated_at IS NULL
                OR ($3::timestamptz IS NOT NULL AND metadata_updated_at < $3::timestamptz)
           THEN $2
           ELSE sell_price
         END,
         updated_at = NOW()
     WHERE id = $1`,
    [params.storeProductId, params.priceMinor, metadataTimestamp]
  );
}

/**
 * MT-10: Decrement catalog stock_balances when a sale is processed
 * This keeps inventory.stock_balances in sync with store_inventory for dashboard display
 */
async function decrementCatalogStock(
  client: PoolClient,
  params: {
    storeId: string;
    saleId: string;
    items: Array<{ productId: string; quantity: number; priceMinor: number }>;
  }
): Promise<void> {
  // AUD-080-E FIX: Sort items by productId before acquiring locks to prevent deadlock
  // When concurrent transactions lock rows in different order, PostgreSQL deadlocks.
  // By always locking in sorted order, we guarantee consistent lock acquisition order.
  const sortedItems = [...params.items].sort((a, b) => a.productId.localeCompare(b.productId));

  for (const item of sortedItems) {
    // Get current stock balance
    const balanceResult = await client.query(
      `SELECT current_qty FROM inventory.stock_balances
       WHERE store_id = $1 AND product_id = $2
       FOR UPDATE`,
      [params.storeId, item.productId]
    );

    const stockBefore = balanceResult.rows[0]?.current_qty ?? 0;
    const deltaQty = -Math.abs(item.quantity);
    const stockAfter = Math.max(0, stockBefore + deltaQty);

    // Create ledger entry for audit trail
    const ledgerId = randomUUID();
    await client.query(
      `INSERT INTO inventory.inventory_ledger
       (id, store_id, product_id, delta_qty, transaction_type, reference_type, reference_id, stock_before, stock_after, unit_cost, source, notes)
       VALUES ($1, $2, $3, $4, 'sale', 'sale', $5, $6, $7, $8, 'POS_SYNC', 'Sale from POS offline sync')`,
      [ledgerId, params.storeId, item.productId, deltaQty, params.saleId, stockBefore, stockAfter, item.priceMinor]
    );

    // Update or create stock_balances entry
    await client.query(
      `INSERT INTO inventory.stock_balances (store_id, product_id, current_qty, last_ledger_id, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (store_id, product_id) DO UPDATE SET
         current_qty = GREATEST(0, inventory.stock_balances.current_qty + $5),
         last_ledger_id = $4,
         updated_at = NOW()`,
      [params.storeId, item.productId, stockAfter, ledgerId, deltaQty]
    );

    // ITER3-007: Also update denormalized stock in store_products for consistency
    await client.query(
      `UPDATE catalog.store_products
       SET current_stock = GREATEST(0, current_stock + $3), updated_at = NOW()
       WHERE store_id = $1 AND product_id = $2 AND is_active = true`,
      [params.storeId, item.productId, deltaQty]
    );
  }
}

/**
 * MT-10: Increment catalog stock_balances when a purchase is processed
 * This keeps inventory.stock_balances in sync with store_inventory for dashboard display
 */
async function incrementCatalogStock(
  client: PoolClient,
  params: {
    storeId: string;
    purchaseId: string;
    items: Array<{ productId: string; quantity: number; unitCostMinor: number }>;
  }
): Promise<void> {
  // AUD-080-E FIX: Sort items by productId before acquiring locks to prevent deadlock
  const sortedItems = [...params.items].sort((a, b) => a.productId.localeCompare(b.productId));

  for (const item of sortedItems) {
    // Get current stock balance
    const balanceResult = await client.query(
      `SELECT current_qty FROM inventory.stock_balances
       WHERE store_id = $1 AND product_id = $2
       FOR UPDATE`,
      [params.storeId, item.productId]
    );

    const stockBefore = balanceResult.rows[0]?.current_qty ?? 0;
    const deltaQty = Math.abs(item.quantity);
    const stockAfter = stockBefore + deltaQty;

    // Create ledger entry for audit trail
    const ledgerId = randomUUID();
    await client.query(
      `INSERT INTO inventory.inventory_ledger
       (id, store_id, product_id, delta_qty, transaction_type, reference_type, reference_id, stock_before, stock_after, unit_cost, source, notes)
       VALUES ($1, $2, $3, $4, 'purchase_received', 'po', $5, $6, $7, $8, 'POS_SYNC', 'Purchase from POS offline sync')`,
      [ledgerId, params.storeId, item.productId, deltaQty, params.purchaseId, stockBefore, stockAfter, item.unitCostMinor]
    );

    // Update or create stock_balances entry
    await client.query(
      `INSERT INTO inventory.stock_balances (store_id, product_id, current_qty, last_ledger_id, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (store_id, product_id) DO UPDATE SET
         current_qty = inventory.stock_balances.current_qty + $5,
         last_ledger_id = $4,
         updated_at = NOW()`,
      [params.storeId, item.productId, stockAfter, ledgerId, deltaQty]
    );

    // ITER3-007: Also update denormalized stock in store_products for consistency
    await client.query(
      `UPDATE catalog.store_products
       SET current_stock = current_stock + $3, updated_at = NOW()
       WHERE store_id = $1 AND product_id = $2 AND is_active = true`,
      [params.storeId, item.productId, deltaQty]
    );
  }
}

// ============================================================================
// LEGACY FUNCTIONS - Used by SALE_CREATED for backward compatibility
// TODO: Migrate SALE_CREATED to catalog schema in MT-6
// ============================================================================

async function ensureRetailerVariant(
  client: PoolClient,
  params: {
    storeId: string;
    variantId: string;
  }
): Promise<void> {
  await client.query(
    `
    INSERT INTO retailer_variants (store_id, variant_id, digitised_by_retailer)
    VALUES ($1, $2, TRUE)
    ON CONFLICT (store_id, variant_id) DO NOTHING
    `,
    [params.storeId, params.variantId]
  );
}

async function upsertRetailerPrice(
  client: PoolClient,
  params: {
    storeId: string;
    variantId: string;
    priceMinor: number;
    eventCreatedAt?: string | null; // AUD-052-A FIX: LWW timestamp from offline event
  }
): Promise<void> {
  // AUD-052-A FIX: Added LWW (Last-Write-Wins) timestamp comparison
  // Parse event timestamp for LWW (when the offline event was created)
  const eventTimestamp = params.eventCreatedAt ? new Date(params.eventCreatedAt) : null;
  const validEventTimestamp = eventTimestamp && !isNaN(eventTimestamp.getTime()) ? eventTimestamp : null;
  const metadataTimestamp = validEventTimestamp ? validEventTimestamp.toISOString() : null;

  await client.query(
    `
    INSERT INTO retailer_variants (store_id, variant_id, selling_price_minor, digitised_by_retailer, price_updated_at)
    VALUES ($1, $2, $3, TRUE, COALESCE($4::timestamptz, NOW()))
    ON CONFLICT (store_id, variant_id)
    DO UPDATE SET
      selling_price_minor = CASE
        WHEN retailer_variants.price_updated_at IS NULL
             OR ($4::timestamptz IS NOT NULL AND retailer_variants.price_updated_at < $4::timestamptz)
        THEN EXCLUDED.selling_price_minor
        ELSE retailer_variants.selling_price_minor
      END,
      price_updated_at = CASE
        WHEN retailer_variants.price_updated_at IS NULL
             OR ($4::timestamptz IS NOT NULL AND retailer_variants.price_updated_at < $4::timestamptz)
        THEN COALESCE($4::timestamptz, NOW())
        ELSE retailer_variants.price_updated_at
      END
    `,
    [params.storeId, params.variantId, params.priceMinor, metadataTimestamp]
  );
}

async function upsertDeviceHeartbeat(params: {
  deviceId: string;
  storeId: string;
  pendingOutboxCount?: number | null;
}): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  await pool.query(
    `
    INSERT INTO pos_devices (id, store_id, last_seen_online, pending_outbox_count, updated_at)
    VALUES ($1, $2, NOW(), COALESCE($3, 0), NOW())
    ON CONFLICT (id) DO UPDATE SET
      store_id = EXCLUDED.store_id,
      last_seen_online = EXCLUDED.last_seen_online,
      pending_outbox_count = CASE
        WHEN $3 IS NULL THEN pos_devices.pending_outbox_count
        ELSE EXCLUDED.pending_outbox_count
      END,
      updated_at = NOW()
    `,
    [params.deviceId, params.storeId, params.pendingOutboxCount ?? null]
  );
}

// AUD-081-C FIX: Sync batch timeout (30 seconds)
// Prevents mobile app from timing out on large batches
const SYNC_BATCH_TIMEOUT_MS = 30000;

// POST /api/v1/pos/sync
posSyncRouter.post("/sync", requireDeviceToken, async (req, res) => {
  const batchStartTime = Date.now();

  const pendingRaw = asNumber(req.body?.pendingOutboxCount);
  const pendingOutboxCount = pendingRaw !== null && pendingRaw >= 0 ? Math.round(pendingRaw) : null;

  const rawEvents = req.body?.events;
  if (!Array.isArray(rawEvents)) {
    return res.status(400).json({ error: "events must be an array" });
  }

  // ITER2-006: Pre-sort events to ensure dependencies are processed in correct order
  // Priority: PRODUCT_UPSERT (0) > SALE_CREATED (1) > PURCHASE_* (2) > PAYMENT_* (3) > COLLECTION (4) > others (5)
  const eventPriority = (type: string | null): number => {
    if (!type) return 5;
    if (type === "PRODUCT_UPSERT" || type === "PRODUCT_PRICE_SET") return 0;
    if (type === "SALE_CREATED") return 1;
    if (type.startsWith("PURCHASE_")) return 2;
    if (type === "PAYMENT_CASH" || type === "PAYMENT_DUE") return 3;
    if (type === "COLLECTION_CREATED") return 4;
    return 5;
  };

  const events = (rawEvents as SyncEvent[]).slice().sort((a, b) => {
    const priorityA = eventPriority(asTrimmedString(a?.type));
    const priorityB = eventPriority(asTrimmedString(b?.type));
    return priorityA - priorityB;
  });

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { deviceId, storeId } = (req as any).posDevice as { deviceId: string; storeId: string };

  await upsertDeviceHeartbeat({ deviceId, storeId, pendingOutboxCount });

  const results: SyncResult[] = [];
  const saleMappings: Array<{
    saleId: string;
    localSaleId: string;
    serverSaleId: string;
    billRef: string;
    offlineReceiptRef?: string | null;
  }> = [];
  const collectionMappings: Array<{ collectionId: string; serverCollectionId: string }> = [];

  // AUD-081-C FIX: Track if we hit timeout to inform client (declared outside try for response access)
  let timedOut = false;
  let processedEventCount = 0;

  const client = await pool.connect();
  try {
    // AUD-080-A FIX: Wrap entire batch in single transaction for atomicity
    // This prevents concurrent batches from interleaving events
    await client.query("BEGIN");
    await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");

    // AUD-080-A FIX: Advisory lock on (store_id, device_id) to serialize concurrent batches
    // This prevents two requests from same device processing overlapping events
    const lockKey = BigInt(`0x${require("crypto").createHash("md5").update(`${storeId}:${deviceId}`).digest("hex").slice(0, 15)}`);
    await client.query(`SELECT pg_advisory_xact_lock($1)`, [lockKey.toString()]);

    for (const raw of events) {
      // AUD-081-C FIX: Check timeout before processing each event
      // This ensures we return partial results instead of timing out completely
      const elapsed = Date.now() - batchStartTime;
      if (elapsed >= SYNC_BATCH_TIMEOUT_MS) {
        timedOut = true;
        console.warn(`[Sync] Batch timeout after ${elapsed}ms, processed ${processedEventCount}/${events.length} events`);
        break;
      }

      const eventId = asTrimmedString(raw?.eventId);
      const type = asTrimmedString(raw?.type);
      const payload = raw?.payload ?? {};

      if (!eventId || !type) {
        results.push({ eventId: eventId ?? "unknown", status: "rejected", error: "invalid event" });
        continue;
      }

      // AUD-080-B FIX: Per-event advisory lock to prevent concurrent INSERT race
      // Two requests with same eventId will serialize on this lock
      const eventLockKey = BigInt(`0x${require("crypto").createHash("md5").update(eventId).digest("hex").slice(0, 15)}`);
      await client.query(`SELECT pg_advisory_xact_lock($1)`, [eventLockKey.toString()]);

      // AUD-080-C FIX: Use SAVEPOINT instead of full ROLLBACK for duplicate handling
      // This allows post-duplicate queries to run inside the transaction
      await client.query(`SAVEPOINT event_${eventId.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 50)}`);

      try {
        const inserted = await client.query(
          `
          INSERT INTO processed_events (event_id, device_id, store_id, event_type)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (event_id) DO NOTHING
          RETURNING event_id
          `,
          [eventId, deviceId, storeId, type]
        );

        if (inserted.rowCount === 0) {
          // AUD-080-C FIX: Query for existing mappings BEFORE rolling back savepoint
          // This ensures queries run inside the transaction for consistency
          if (type === "SALE_CREATED") {
            const saleId = asTrimmedString((payload as any)?.saleId);
            if (saleId) {
              const saleRow = await client.query(
                `SELECT id, bill_ref, offline_receipt_ref FROM sales WHERE id = $1 AND store_id = $2`,
                [saleId, storeId]
              );
              const sale = saleRow.rows[0];
              if (sale) {
                saleMappings.push({
                  saleId,
                  localSaleId: saleId,
                  serverSaleId: sale.id,
                  billRef: sale.bill_ref,
                  offlineReceiptRef: sale.offline_receipt_ref ?? null
                });
              }
            }
          }
          if (type === "COLLECTION_CREATED") {
            const collectionId = asTrimmedString((payload as any)?.collectionId);
            if (collectionId) {
              const collectionRow = await client.query(
                `SELECT id FROM collections WHERE id = $1 AND store_id = $2`,
                [collectionId, storeId]
              );
              if (collectionRow.rows[0]) {
                collectionMappings.push({ collectionId, serverCollectionId: collectionId });
              }
            }
          }

          // Rollback savepoint (no-op since duplicate detection already complete)
          await client.query(`ROLLBACK TO SAVEPOINT event_${eventId.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 50)}`);
          results.push({ eventId, status: "duplicate_ignored" });
          continue;
        }

        if (type === "PRODUCT_UPSERT") {
          // MT-3: Write to catalog schema instead of legacy tables
          const barcode = asTrimmedString((payload as any)?.barcode);
          const name = asTrimmedString((payload as any)?.name);
          const eventCreatedAt = asTrimmedString(raw?.createdAt); // LWW timestamp from offline event
          if (!barcode) {
            throw new Error("barcode is required");
          }
          await ensureCatalogProduct(client, { storeId, barcode, name, eventCreatedAt });
        } else if (type === "PRODUCT_PRICE_SET") {
          // MT-3 Iteration 2: Write to catalog schema instead of legacy tables
          const barcode = asTrimmedString((payload as any)?.barcode);
          const priceMinorRaw = asNumber((payload as any)?.priceMinor);
          const priceMinor = priceMinorRaw === null ? null : Math.round(priceMinorRaw);
          const eventCreatedAt = asTrimmedString(raw?.createdAt); // LWW timestamp from offline event
          if (!barcode || priceMinor === null || priceMinor <= 0) {
            throw new Error("invalid price");
          }
          // Ensure product exists in catalog, then update price
          const { storeProductId } = await ensureCatalogProduct(client, { storeId, barcode, name: null, eventCreatedAt });
          await upsertCatalogPrice(client, { storeId, storeProductId, priceMinor, eventCreatedAt });
        } else if (type === "SALE_CREATED") {
          const saleId = asTrimmedString((payload as any)?.saleId);
          const offlineReceiptRef =
            asTrimmedString((payload as any)?.offlineReceiptRef) ??
            asTrimmedString((payload as any)?.billRef);
          const items = Array.isArray((payload as any)?.items) ? (payload as any).items : [];
          const currency = asTrimmedString((payload as any)?.currency) ?? "INR";
          const discountMinor = Math.max(0, Math.round(asNumber((payload as any)?.discountMinor) ?? 0));
          const createdAt = asTrimmedString((payload as any)?.createdAt);

          if (!saleId || !offlineReceiptRef || items.length === 0) {
            throw new Error("invalid sale payload");
          }

          const existingSale = await client.query(
            `SELECT id, store_id, bill_ref, offline_receipt_ref FROM sales WHERE id = $1 AND store_id = $2`,
            [saleId, storeId]
          );
          if ((existingSale.rowCount ?? 0) > 0) {
            const existing = existingSale.rows[0];
            await client.query("COMMIT");
            results.push({ eventId, status: "duplicate_ignored" });
            saleMappings.push({
              saleId,
              localSaleId: saleId,
              serverSaleId: existing.id,
              billRef: existing.bill_ref,
              offlineReceiptRef: existing.offline_receipt_ref ?? offlineReceiptRef
            });
            continue;
          }

          const computedSubtotal = items.reduce((sum: number, item: any) => {
            const qtyRaw = asNumber(item?.quantity);
            const priceRaw = asNumber(item?.priceMinor);
            const qty = qtyRaw === null ? 0 : Math.round(qtyRaw);
            const price = priceRaw === null ? 0 : Math.round(priceRaw);
            return sum + qty * price;
          }, 0);
          const computedTotal = Math.max(0, computedSubtotal - discountMinor);

          let billRef = buildBillRef();
          let insertedSale = false;
          for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
              await client.query(
                `
                INSERT INTO sales (
                  id,
                  store_id,
                  device_id,
                  bill_ref,
                  offline_receipt_ref,
                  subtotal_minor,
                  discount_minor,
                  total_minor,
                  status,
                  created_at,
                  currency
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, NOW()), $11)
                `,
                [
                  saleId,
                  storeId,
                  deviceId,
                  billRef,
                  offlineReceiptRef,
                  computedSubtotal,
                  discountMinor,
                  computedTotal,
                  "completed",
                  createdAt,
                  currency
                ]
              );
              insertedSale = true;
              break;
            } catch (error) {
              billRef = buildBillRef();
              if (attempt === 2) {
                throw error;
              }
            }
          }

          if (!insertedSale) {
            throw new Error("failed to insert sale");
          }

          const resolvedItems: Array<{
            productId: string;
            variantId: string;
            quantity: number;
            priceMinor: number;
            name: string;
            barcode: string;
            globalProductId?: string | null;
          }> = [];

          // Validation constants to prevent overflow and abuse
          const MAX_QUANTITY = 100000; // Maximum 100k items per line
          const MAX_PRICE_MINOR = 100000000; // Maximum 1 million INR per item

          for (const item of items) {
            const barcode = asTrimmedString(item?.barcode);
            const name = asTrimmedString(item?.name);
            const quantityRaw = asNumber(item?.quantity);
            const priceMinorRaw = asNumber(item?.priceMinor);
            const globalProductId =
              asTrimmedString(item?.globalProductId) ?? asTrimmedString(item?.global_product_id);
            const quantity = quantityRaw === null ? null : Math.round(quantityRaw);
            const priceMinor = priceMinorRaw === null ? null : Math.round(priceMinorRaw);

            if (
              !barcode ||
              quantity === null ||
              quantity <= 0 ||
              quantity > MAX_QUANTITY ||
              priceMinor === null ||
              priceMinor <= 0 ||
              priceMinor > MAX_PRICE_MINOR
            ) {
              throw new Error("invalid sale item: quantity must be 1-100000, price must be 1-100000000 minor");
            }

            const fallbackName = `Item ${barcode.slice(-4)}`;
            const itemName = name ?? fallbackName;

            // MT-6: Dual-write - ensure product exists in BOTH schemas
            // 1. Catalog schema (so Dashboard can see products from offline sales)
            const { productId } = await ensureCatalogProduct(client, { storeId, barcode, name: itemName, eventCreatedAt: createdAt });

            // 2. Legacy schema (for sales/inventory compatibility)
            const variantId = await ensureProductByBarcode(client, { barcode, name: itemName, currency });
            await ensureRetailerVariant(client, { storeId, variantId });

            resolvedItems.push({
              productId,
              variantId,
              quantity,
              priceMinor,
              name: itemName,
              barcode,
              globalProductId
            });
          }

          await ensureStoreInventoryAvailability({
            client,
            storeId,
            items: resolvedItems.map((item) => ({
              variantId: item.variantId,
              quantity: item.quantity,
              globalProductId: item.globalProductId ?? null,
              name: item.name
            }))
          });

          await ensureSaleAvailability({
            client,
            storeId,
            items: resolvedItems.map((item) => ({ variantId: item.variantId, quantity: item.quantity }))
          });

          for (const item of resolvedItems) {
            const lineTotal = item.priceMinor * item.quantity;
            await client.query(
              `
              INSERT INTO sale_items (id, sale_id, product_id, variant_id, quantity, price_minor, line_total_minor, item_name, barcode)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
              `,
              [
                randomUUID(),
                saleId,
                item.productId,
                item.variantId,
                item.quantity,
                item.priceMinor,
                lineTotal,
                item.name,
                item.barcode
              ]
            );
          }

          await recordSaleInventoryMovements({
            client,
            storeId,
            saleId,
            items: resolvedItems.map((item) => ({
              variantId: item.variantId,
              quantity: item.quantity,
              unitSellMinor: item.priceMinor,
              name: item.name,
              globalProductId: item.globalProductId ?? null
            }))
          });

          // MT-10: Also update catalog inventory.stock_balances for dashboard consistency
          await decrementCatalogStock(client, {
            storeId,
            saleId,
            items: resolvedItems.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              priceMinor: item.priceMinor
            }))
          });

          await applyBulkDeductions({
            client,
            storeId,
            items: resolvedItems.map((item) => ({ variantId: item.variantId, quantity: item.quantity }))
          });

          const saleRow = await client.query(
            `SELECT bill_ref, offline_receipt_ref FROM sales WHERE id = $1 AND store_id = $2`,
            [saleId, storeId]
          );
          const saleInfo = saleRow.rows[0];
          saleMappings.push({
            saleId,
            localSaleId: saleId,
            serverSaleId: saleId,
            billRef: saleInfo?.bill_ref ?? "",
            offlineReceiptRef: saleInfo?.offline_receipt_ref ?? offlineReceiptRef
          });
        } else if (type === "PURCHASE_SUBMIT") {
          const purchaseId = asTrimmedString((payload as any)?.purchaseId) ?? undefined;
          const supplierName = asTrimmedString((payload as any)?.supplierName) ?? null;
          const currency = asTrimmedString((payload as any)?.currency) ?? undefined;
          const items = Array.isArray((payload as any)?.items) ? (payload as any).items : [];

          if (items.length === 0) {
            throw new Error("invalid purchase payload");
          }

          const normalizedItems: PurchaseItemInput[] = items.map((item: any) => {
            const quantityRaw = asNumber(item?.quantity);
            const purchasePriceRaw = asNumber(item?.purchasePriceMinor);
            const unitCostRaw = purchasePriceRaw === null ? asNumber(item?.unitCostMinor) : purchasePriceRaw;
            const quantity = quantityRaw === null ? null : Math.round(quantityRaw);
            const unitCostMinor = unitCostRaw === null ? null : Math.round(unitCostRaw);
            if (quantity === null || quantity <= 0 || unitCostMinor === null || unitCostMinor <= 0) {
              throw new Error("invalid purchase item");
            }

            return {
              barcode: asTrimmedString(item?.barcode) ?? undefined,
              productId: asTrimmedString(item?.productId) ?? undefined,
              productName: asTrimmedString(item?.name) ?? asTrimmedString(item?.productName) ?? undefined,
              globalProductId:
                asTrimmedString(item?.globalProductId) ??
                asTrimmedString(item?.global_product_id) ??
                undefined,
              scanFormat: asTrimmedString(item?.scanFormat) ?? asTrimmedString(item?.format) ?? null,
              quantity,
              unit: asTrimmedString(item?.unit) ?? undefined,
              unitCostMinor,
              currency: asTrimmedString(item?.currency) ?? currency
            };
          });

          await createPurchase({
            client,
            storeId,
            input: { purchaseId, supplierName, currency, items: normalizedItems },
            skipIfExists: true
          });

          // MT-6 Iteration 2: Dual-write for PURCHASE_SUBMIT price updates
          // MT-10: Also collect items for catalog stock_balances increment
          const eventCreatedAt = asTrimmedString(raw?.createdAt);
          const catalogPurchaseItems: Array<{ productId: string; quantity: number; unitCostMinor: number }> = [];
          for (const item of items) {
            const barcode = asTrimmedString(item?.barcode);
            const sellingPriceRaw = asNumber(item?.sellingPriceMinor);
            const sellingPriceMinor = sellingPriceRaw === null ? null : Math.round(sellingPriceRaw);
            const quantityRaw = asNumber(item?.quantity);
            const quantity = quantityRaw === null ? 0 : Math.round(quantityRaw);
            const unitCostRaw = asNumber(item?.purchasePriceMinor) ?? asNumber(item?.unitCostMinor);
            const unitCostMinor = unitCostRaw === null ? 0 : Math.round(unitCostRaw);

            if (!barcode) continue;

            const itemName = asTrimmedString(item?.name);
            const itemCurrency = asTrimmedString(item?.currency) ?? currency ?? "INR";

            // 1. Catalog schema (so Dashboard sees products from purchases)
            const { productId, storeProductId } = await ensureCatalogProduct(client, { storeId, barcode, name: itemName, eventCreatedAt });
            if (sellingPriceMinor !== null && sellingPriceMinor > 0) {
              await upsertCatalogPrice(client, { storeId, storeProductId, priceMinor: sellingPriceMinor, eventCreatedAt });
            }

            // MT-10: Collect for stock_balances increment
            if (quantity > 0 && unitCostMinor > 0) {
              catalogPurchaseItems.push({ productId, quantity, unitCostMinor });
            }

            // 2. Legacy schema (for backward compatibility)
            if (sellingPriceMinor !== null && sellingPriceMinor > 0) {
              const variantId = await ensureProductByBarcode(client, { barcode, name: itemName, currency: itemCurrency });
              await upsertRetailerPrice(client, { storeId, variantId, priceMinor: sellingPriceMinor, eventCreatedAt });
            }
          }

          // MT-10: Update catalog stock_balances for dashboard consistency
          if (catalogPurchaseItems.length > 0) {
            await incrementCatalogStock(client, {
              storeId,
              purchaseId: purchaseId ?? randomUUID(),
              items: catalogPurchaseItems
            });
          }
        } else if (type === "PURCHASE_CREATED") {
          const purchaseId = asTrimmedString((payload as any)?.purchaseId) ?? undefined;
          const supplierName = asTrimmedString((payload as any)?.supplierName) ?? null;
          const currency = asTrimmedString((payload as any)?.currency) ?? undefined;
          const items = Array.isArray((payload as any)?.items) ? (payload as any).items : [];
          if (items.length === 0) {
            throw new Error("invalid purchase payload");
          }

          // MT-6 Iteration 3: Dual-write products to catalog before purchase creation
          // MT-10: Also collect items for catalog stock_balances increment
          const eventCreatedAt = asTrimmedString(raw?.createdAt);
          const catalogPurchaseItems: Array<{ productId: string; quantity: number; unitCostMinor: number }> = [];
          for (const item of items) {
            const barcode = asTrimmedString(item?.barcode);
            if (barcode) {
              const itemName = asTrimmedString(item?.productName) ?? asTrimmedString(item?.name);
              const { productId } = await ensureCatalogProduct(client, { storeId, barcode, name: itemName, eventCreatedAt });

              // MT-10: Collect for stock_balances increment
              const quantityRaw = asNumber(item?.quantity);
              const purchasePriceRaw = asNumber(item?.purchasePriceMinor);
              const unitCostRaw = purchasePriceRaw === null ? asNumber(item?.unitCostMinor) : purchasePriceRaw;
              const quantity = quantityRaw === null ? 0 : Math.round(quantityRaw);
              const unitCostMinor = unitCostRaw === null ? 0 : Math.round(unitCostRaw);
              if (quantity > 0 && unitCostMinor > 0) {
                catalogPurchaseItems.push({ productId, quantity, unitCostMinor });
              }
            }
          }

          const normalizedItems: PurchaseItemInput[] = items.map((item: any) => {
            const quantityRaw = asNumber(item?.quantity);
            const purchasePriceRaw = asNumber(item?.purchasePriceMinor);
            const unitCostRaw = purchasePriceRaw === null ? asNumber(item?.unitCostMinor) : purchasePriceRaw;
            const quantity = quantityRaw === null ? null : Math.round(quantityRaw);
            const unitCostMinor = unitCostRaw === null ? null : Math.round(unitCostRaw);
            if (quantity === null || quantity <= 0 || unitCostMinor === null || unitCostMinor <= 0) {
              throw new Error("invalid purchase item");
            }

            return {
              barcode: asTrimmedString(item?.barcode) ?? undefined,
              productId: asTrimmedString(item?.productId) ?? undefined,
              productName: asTrimmedString(item?.productName) ?? asTrimmedString(item?.name) ?? undefined,
              globalProductId:
                asTrimmedString(item?.globalProductId) ??
                asTrimmedString(item?.global_product_id) ??
                undefined,
              scanFormat: asTrimmedString(item?.scanFormat) ?? asTrimmedString(item?.format) ?? null,
              quantity,
              unit: asTrimmedString(item?.unit) ?? undefined,
              unitCostMinor,
              currency: asTrimmedString(item?.currency) ?? currency
            };
          });

          await createPurchase({
            client,
            storeId,
            input: { purchaseId, supplierName, currency, items: normalizedItems },
            skipIfExists: true
          });

          // MT-10: Update catalog stock_balances for dashboard consistency
          if (catalogPurchaseItems.length > 0) {
            await incrementCatalogStock(client, {
              storeId,
              purchaseId: purchaseId ?? randomUUID(),
              items: catalogPurchaseItems
            });
          }
        } else if (type === "PAYMENT_CASH" || type === "PAYMENT_DUE") {
          const saleId = asTrimmedString((payload as any)?.saleId);
          const amountRaw = asNumber((payload as any)?.amountMinor);
          const amountMinor = amountRaw === null ? null : Math.round(amountRaw);
          if (!saleId || amountMinor === null || amountMinor <= 0) {
            throw new Error("invalid payment payload");
          }

          const saleRes = await client.query(
            `SELECT id, store_id FROM sales WHERE id = $1 AND store_id = $2`,
            [saleId, storeId]
          );
          const sale = saleRes.rows[0];
          if (!sale) {
            // ITER2-006: Check if there's a pending SALE_CREATED for this sale in the batch
            // If so, throw a retriable error; the client should reorder events or retry
            const pendingSaleCreate = events.some(
              (e) => asTrimmedString(e?.type) === "SALE_CREATED" &&
                     asTrimmedString((e?.payload as any)?.saleId) === saleId
            );
            if (pendingSaleCreate) {
              // Sale exists in batch but hasn't been processed yet - client should reorder
              throw new Error("sale_not_yet_created:reorder_events");
            }
            // ITER2-006: Use specific error code to signal retriable condition
            throw new Error("sale_not_yet_synced:retry_later");
          }

          const mode = type === "PAYMENT_CASH" ? "CASH" : "DUE";
          const status = mode === "CASH" ? "PAID" : "DUE";

          // AUD-080-D FIX: Include amount_minor in dedup check to detect amount mismatches
          // If payment exists with different amount, log warning and use the higher amount
          const existingPayment = await client.query(
            `SELECT id, amount_minor FROM payments WHERE sale_id = $1 AND mode = $2 AND status = $3 LIMIT 1`,
            [saleId, mode, status]
          );

          if ((existingPayment.rowCount ?? 0) === 0) {
            await client.query(
              `
              INSERT INTO payments (id, sale_id, mode, status, amount_minor)
              VALUES ($1, $2, $3, $4, $5)
              `,
              [randomUUID(), saleId, mode, status, amountMinor]
            );

            await client.query(`UPDATE sales SET status = $1 WHERE id = $2`, [
              mode === "CASH" ? "PAID_CASH" : "DUE",
              saleId
            ]);
          } else {
            // AUD-080-D FIX: Check for amount mismatch and update if new amount is higher
            const existingAmount = existingPayment.rows[0]?.amount_minor ?? 0;
            if (existingAmount !== amountMinor) {
              console.warn(`[Sync] PAYMENT amount mismatch: sale_id=${saleId}, existing=${existingAmount}, new=${amountMinor}`);
              // Use the higher amount (customer likely corrected underpayment)
              if (amountMinor > existingAmount) {
                await client.query(
                  `UPDATE payments SET amount_minor = $1, updated_at = NOW() WHERE id = $2`,
                  [amountMinor, existingPayment.rows[0].id]
                );
                console.log(`[Sync] Updated payment amount from ${existingAmount} to ${amountMinor}`);
              }
            }
          }
        } else if (type === "COLLECTION_CREATED") {
          const collectionId = asTrimmedString((payload as any)?.collectionId);
          const amountRaw = asNumber((payload as any)?.amountMinor);
          const amountMinor = amountRaw === null ? null : Math.round(amountRaw);
          const mode = asTrimmedString((payload as any)?.mode);
          const status = asTrimmedString((payload as any)?.status);
          const reference = asTrimmedString((payload as any)?.reference);
          const createdAt = asTrimmedString((payload as any)?.createdAt);
          const saleId = asTrimmedString((payload as any)?.saleId); // AUD-062-B: Optional explicit sale reference

          if (!collectionId || amountMinor === null || amountMinor <= 0 || !mode || !status) {
            throw new Error("invalid collection payload");
          }

          // AUD-062-B FIX: Soft validation of reference - log warning if sale reference is invalid
          // This helps identify orphaned collections without rejecting the financial record
          const effectiveSaleId = saleId || reference;
          if (effectiveSaleId && /^[0-9a-f-]{36}$/i.test(effectiveSaleId)) {
            // Reference looks like a UUID, check if sale exists
            const saleCheck = await client.query(
              `SELECT id FROM sales WHERE id = $1 AND store_id = $2`,
              [effectiveSaleId, storeId]
            );
            if ((saleCheck.rowCount ?? 0) === 0) {
              console.warn(`[Sync] COLLECTION_CREATED: Reference ${effectiveSaleId} appears to be a sale ID but sale not found for store ${storeId}. Collection will be created anyway.`);
            }
          }

          const existing = await client.query(
            `SELECT id FROM collections WHERE id = $1 AND store_id = $2`,
            [collectionId, storeId]
          );
          if ((existing.rowCount ?? 0) === 0) {
            await client.query(
              `
              INSERT INTO collections (id, store_id, device_id, amount_minor, mode, reference, status, created_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, NOW()))
              `,
              [collectionId, storeId, deviceId, amountMinor, mode, reference, status, createdAt]
            );
          }

          collectionMappings.push({ collectionId, serverCollectionId: collectionId });
        } else {
          throw new Error("unknown event type");
        }

        // AUD-080-A FIX: Release savepoint on success (event committed to batch transaction)
        await client.query(`RELEASE SAVEPOINT event_${eventId.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 50)}`);
        results.push({ eventId, status: "applied" });
        processedEventCount++;
      } catch (error: any) {
        // AUD-080-A FIX: Rollback only the current event's savepoint, not the entire batch
        // This allows other events in the batch to still be processed
        await client.query(`ROLLBACK TO SAVEPOINT event_${eventId.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 50)}`);
        let errorMessage = error?.message ? String(error.message) : "rejected";
        if (error instanceof InsufficientStockError) {
          const details = Array.isArray(error.details) ? error.details : [];
          if (details.length > 0) {
            errorMessage = details.map((detail) => `${detail.skuId}: ${detail.message}`).join("; ");
          } else {
            errorMessage = "insufficient_stock";
          }
        }
        results.push({ eventId, status: "rejected", error: errorMessage });
        processedEventCount++;
      }
    }

    // AUD-080-A FIX: Commit entire batch transaction after all events processed
    await client.query("COMMIT");
  } catch (batchError: any) {
    // If batch-level error occurs, rollback entire transaction
    try {
      await client.query("ROLLBACK");
    } catch (_) { /* ignore rollback errors */ }
    console.error(`[Sync] Batch transaction failed:`, batchError?.message);
    return res.status(500).json({
      error: "batch_transaction_failed",
      message: batchError?.message ?? "unknown error"
    });
  } finally {
    client.release();
  }

  // AUD-081-B FIX: Server decrements pending_outbox_count based on processed events
  // This ensures accurate count even if device goes offline after sync
  const processedCount = results.filter(
    r => r.status === "applied" || r.status === "duplicate_ignored"
  ).length;

  // Calculate new pending count: client-reported minus processed
  // Only update if client provided a count, otherwise keep existing
  let newPendingCount: number | null = null;
  if (pendingOutboxCount !== null) {
    newPendingCount = Math.max(0, pendingOutboxCount - processedCount);
  }

  await pool.query(
    `
    UPDATE pos_devices
    SET last_sync_at = NOW(),
        pending_outbox_count = COALESCE($2, pending_outbox_count),
        updated_at = NOW()
    WHERE id = $1
    `,
    [deviceId, newPendingCount]
  );

  // AUD-081-C FIX: Include timedOut flag so client knows to retry with remaining events
  return res.json({ results, saleMappings, collectionMappings, timedOut });
});
