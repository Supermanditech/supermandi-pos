// Inventory Service Database Queries - V3.0.9 compliant
// CRUD operations for inventory.inventory_ledger and inventory.stock_balances

import { query, getClient, BaseEntity } from '@supermandi/common';
import { PoolClient } from 'pg';

// =============================================================================
// LEDGER TYPES
// =============================================================================

export type TransactionType = 'sale' | 'sale_return' | 'purchase_received' | 'adjustment' | 'opening_stock';
export type ReferenceType = 'sale' | 'po' | 'return' | 'manual';

export interface LedgerEntry extends BaseEntity {
  storeId: string;
  productId: string;
  deltaQty: number;
  transactionType: TransactionType;
  referenceType?: ReferenceType;
  referenceId?: string;
  referenceSubId?: string;
  stockBefore: number;
  stockAfter: number;
  unitCost?: number;
  createdByUserId?: string;
  notes?: string;
}

export interface CreateLedgerEntryInput {
  storeId: string;
  productId: string;
  deltaQty: number;
  transactionType: TransactionType;
  referenceType?: ReferenceType;
  referenceId?: string;
  referenceSubId?: string;
  unitCost?: number;
  createdByUserId?: string;
  notes?: string;
}

// =============================================================================
// STOCK BALANCE TYPES
// =============================================================================

export interface StockBalance {
  storeId: string;
  productId: string;
  currentQty: number;
  lastLedgerId?: string;
  updatedAt: Date;
}

export interface StockBalanceWithProduct extends StockBalance {
  productName?: string;
  productSku?: string;
}

// =============================================================================
// LEDGER QUERIES
// =============================================================================

export async function getLedgerEntriesForProduct(
  storeId: string,
  productId: string,
  limit: number = 50
): Promise<LedgerEntry[]> {
  return query<LedgerEntry>(
    `SELECT
      id,
      store_id as "storeId",
      product_id as "productId",
      delta_qty as "deltaQty",
      transaction_type as "transactionType",
      reference_type as "referenceType",
      reference_id as "referenceId",
      reference_sub_id as "referenceSubId",
      stock_before as "stockBefore",
      stock_after as "stockAfter",
      unit_cost as "unitCost",
      created_by_user_id as "createdByUserId",
      notes,
      created_at as "createdAt"
    FROM inventory.inventory_ledger
    WHERE store_id = $1 AND product_id = $2
    ORDER BY created_at DESC
    LIMIT $3`,
    [storeId, productId, limit]
  );
}

export async function getLedgerEntriesByReference(
  referenceType: ReferenceType,
  referenceId: string
): Promise<LedgerEntry[]> {
  return query<LedgerEntry>(
    `SELECT
      id,
      store_id as "storeId",
      product_id as "productId",
      delta_qty as "deltaQty",
      transaction_type as "transactionType",
      reference_type as "referenceType",
      reference_id as "referenceId",
      reference_sub_id as "referenceSubId",
      stock_before as "stockBefore",
      stock_after as "stockAfter",
      unit_cost as "unitCost",
      created_by_user_id as "createdByUserId",
      notes,
      created_at as "createdAt"
    FROM inventory.inventory_ledger
    WHERE reference_type = $1 AND reference_id = $2
    ORDER BY created_at ASC`,
    [referenceType, referenceId]
  );
}

export async function getRecentLedgerEntriesForStore(
  storeId: string,
  limit: number = 100
): Promise<LedgerEntry[]> {
  return query<LedgerEntry>(
    `SELECT
      id,
      store_id as "storeId",
      product_id as "productId",
      delta_qty as "deltaQty",
      transaction_type as "transactionType",
      reference_type as "referenceType",
      reference_id as "referenceId",
      reference_sub_id as "referenceSubId",
      stock_before as "stockBefore",
      stock_after as "stockAfter",
      unit_cost as "unitCost",
      created_by_user_id as "createdByUserId",
      notes,
      created_at as "createdAt"
    FROM inventory.inventory_ledger
    WHERE store_id = $1
    ORDER BY created_at DESC
    LIMIT $2`,
    [storeId, limit]
  );
}

// =============================================================================
// STOCK BALANCE QUERIES
// =============================================================================

export async function getStockBalance(
  storeId: string,
  productId: string
): Promise<StockBalance | null> {
  const rows = await query<StockBalance>(
    `SELECT
      store_id as "storeId",
      product_id as "productId",
      current_qty as "currentQty",
      last_ledger_id as "lastLedgerId",
      updated_at as "updatedAt"
    FROM inventory.stock_balances
    WHERE store_id = $1 AND product_id = $2`,
    [storeId, productId]
  );
  return rows[0] || null;
}

export async function getCurrentStock(storeId: string, productId: string): Promise<number> {
  const balance = await getStockBalance(storeId, productId);
  return balance?.currentQty ?? 0;
}

export async function getAllStockBalancesForStore(
  storeId: string,
  limit = 200,
  offset = 0
): Promise<StockBalance[]> {
  return query<StockBalance>(
    `SELECT
      store_id as "storeId",
      product_id as "productId",
      current_qty as "currentQty",
      last_ledger_id as "lastLedgerId",
      updated_at as "updatedAt"
    FROM inventory.stock_balances
    WHERE store_id = $1
    ORDER BY product_id
    LIMIT $2 OFFSET $3`,
    [storeId, limit, offset]
  );
}

export async function getStockBalancesForProducts(
  storeId: string,
  productIds: string[]
): Promise<StockBalance[]> {
  if (productIds.length === 0) return [];
  return query<StockBalance>(
    `SELECT
      store_id as "storeId",
      product_id as "productId",
      current_qty as "currentQty",
      last_ledger_id as "lastLedgerId",
      updated_at as "updatedAt"
    FROM inventory.stock_balances
    WHERE store_id = $1 AND product_id = ANY($2)
    ORDER BY product_id`,
    [storeId, productIds]
  );
}

export async function getLowStockProducts(
  storeId: string,
  threshold: number
): Promise<StockBalance[]> {
  return query<StockBalance>(
    `SELECT
      store_id as "storeId",
      product_id as "productId",
      current_qty as "currentQty",
      last_ledger_id as "lastLedgerId",
      updated_at as "updatedAt"
    FROM inventory.stock_balances
    WHERE store_id = $1 AND current_qty <= $2
    ORDER BY current_qty ASC`,
    [storeId, threshold]
  );
}

// =============================================================================
// TRANSACTIONAL LEDGER OPERATIONS (uses FOR UPDATE locking)
// =============================================================================

/**
 * Create a ledger entry and update stock balance in a single transaction.
 * Uses FOR UPDATE locking on stock_balances to prevent race conditions.
 * This is the core atomic operation for all inventory movements.
 */
export async function createLedgerEntryWithBalanceUpdate(
  input: CreateLedgerEntryInput
): Promise<LedgerEntry> {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get current stock with FOR UPDATE lock (or default to 0 if not exists)
    const balanceResult = await client.query(
      `SELECT current_qty as "currentQty"
       FROM inventory.stock_balances
       WHERE store_id = $1 AND product_id = $2
       FOR UPDATE`,
      [input.storeId, input.productId]
    );

    const currentQty = balanceResult.rows[0]?.currentQty ?? 0;
    const newQty = currentQty + input.deltaQty;

    // Enforce non-negative stock invariant for all transaction types.
    if (newQty < 0) {
      throw new Error(`Insufficient stock. Current: ${currentQty}, Delta: ${input.deltaQty}`);
    }

    // Insert ledger entry (append-only)
    const ledgerResult = await client.query(
      `INSERT INTO inventory.inventory_ledger (
        store_id, product_id, delta_qty, transaction_type,
        reference_type, reference_id, reference_sub_id,
        stock_before, stock_after, unit_cost,
        created_by_user_id, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING
        id,
        store_id as "storeId",
        product_id as "productId",
        delta_qty as "deltaQty",
        transaction_type as "transactionType",
        reference_type as "referenceType",
        reference_id as "referenceId",
        reference_sub_id as "referenceSubId",
        stock_before as "stockBefore",
        stock_after as "stockAfter",
        unit_cost as "unitCost",
        created_by_user_id as "createdByUserId",
        notes,
        created_at as "createdAt"`,
      [
        input.storeId,
        input.productId,
        input.deltaQty,
        input.transactionType,
        input.referenceType || null,
        input.referenceId || null,
        input.referenceSubId || null,
        currentQty,
        newQty,
        input.unitCost || null,
        input.createdByUserId || null,
        input.notes || null,
      ]
    );

    const ledgerEntry = ledgerResult.rows[0] as LedgerEntry;

    // Upsert stock balance
    await client.query(
      `INSERT INTO inventory.stock_balances (store_id, product_id, current_qty, last_ledger_id, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (store_id, product_id)
       DO UPDATE SET
         current_qty = $3,
         last_ledger_id = $4,
         updated_at = NOW()`,
      [input.storeId, input.productId, newQty, ledgerEntry.id]
    );

    // T-054: Sync denormalized store_products.current_stock to prevent drift
    await client.query(
      `UPDATE catalog.store_products SET current_stock = $3, updated_at = NOW()
       WHERE store_id = $1 AND product_id = $2 AND is_active = true`,
      [input.storeId, input.productId, newQty]
    );

    await client.query('COMMIT');

    return ledgerEntry;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Create multiple ledger entries in a single transaction (for batch operations).
 * Used for bulk adjustments or multi-product sales.
 */
export async function createBatchLedgerEntries(
  entries: CreateLedgerEntryInput[]
): Promise<LedgerEntry[]> {
  if (entries.length === 0) return [];

  const client = await getClient();
  const results: LedgerEntry[] = [];

  try {
    await client.query('BEGIN');

    for (const input of entries) {
      const ledgerEntry = await createLedgerEntryWithClient(client, input);
      results.push(ledgerEntry);
    }

    await client.query('COMMIT');
    return results;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Internal helper for creating ledger entry within an existing transaction
 */
async function createLedgerEntryWithClient(
  client: PoolClient,
  input: CreateLedgerEntryInput
): Promise<LedgerEntry> {
  // Get current stock with FOR UPDATE lock
  const balanceResult = await client.query(
    `SELECT current_qty as "currentQty"
     FROM inventory.stock_balances
     WHERE store_id = $1 AND product_id = $2
     FOR UPDATE`,
    [input.storeId, input.productId]
  );

  const currentQty = balanceResult.rows[0]?.currentQty ?? 0;
  const newQty = currentQty + input.deltaQty;

  // Enforce non-negative stock invariant for all transaction types.
  if (newQty < 0) {
    throw new Error(
      `Insufficient stock for product ${input.productId}. Current: ${currentQty}, Delta: ${input.deltaQty}`
    );
  }

  // Insert ledger entry
  const ledgerResult = await client.query(
    `INSERT INTO inventory.inventory_ledger (
      store_id, product_id, delta_qty, transaction_type,
      reference_type, reference_id, reference_sub_id,
      stock_before, stock_after, unit_cost,
      created_by_user_id, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING
      id,
      store_id as "storeId",
      product_id as "productId",
      delta_qty as "deltaQty",
      transaction_type as "transactionType",
      reference_type as "referenceType",
      reference_id as "referenceId",
      reference_sub_id as "referenceSubId",
      stock_before as "stockBefore",
      stock_after as "stockAfter",
      unit_cost as "unitCost",
      created_by_user_id as "createdByUserId",
      notes,
      created_at as "createdAt"`,
    [
      input.storeId,
      input.productId,
      input.deltaQty,
      input.transactionType,
      input.referenceType || null,
      input.referenceId || null,
      input.referenceSubId || null,
      currentQty,
      newQty,
      input.unitCost || null,
      input.createdByUserId || null,
      input.notes || null,
    ]
  );

  const ledgerEntry = ledgerResult.rows[0] as LedgerEntry;

  // Upsert stock balance
  await client.query(
    `INSERT INTO inventory.stock_balances (store_id, product_id, current_qty, last_ledger_id, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (store_id, product_id)
     DO UPDATE SET
       current_qty = $3,
       last_ledger_id = $4,
       updated_at = NOW()`,
    [input.storeId, input.productId, newQty, ledgerEntry.id]
  );

  // T-054: Sync denormalized store_products.current_stock to prevent drift
  await client.query(
    `UPDATE catalog.store_products SET current_stock = $3, updated_at = NOW()
     WHERE store_id = $1 AND product_id = $2 AND is_active = true`,
    [input.storeId, input.productId, newQty]
  );

  return ledgerEntry;
}
