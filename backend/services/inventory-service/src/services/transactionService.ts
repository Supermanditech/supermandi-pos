// Transaction Service - V3.0.10 compliant
// Inventory transaction operations with event outbox integration
// DEV-066: Sign application verified - sale=-qty, purchase_received=+qty

import { ApiError, getClient } from '@supermandi/common';
import { PoolClient } from 'pg';
import {
  LedgerEntry,
  TransactionType,
  ReferenceType,
  CreateLedgerEntryInput,
} from '../db/queries.js';

// =============================================================================
// TRANSACTION INPUT TYPES
// =============================================================================

export interface TransactionItem {
  productId: string;
  quantity: number; // Always positive - sign determined by transactionType
  unitCost?: number; // Minor units (paise)
}

export interface CreateTransactionInput {
  storeId: string;
  items: TransactionItem[];
  transactionType: TransactionType;
  referenceType?: ReferenceType;
  referenceId?: string;
  referenceSubId?: string;
  userId?: string;
  notes?: string;
}

export interface AdjustmentInput {
  storeId: string;
  productId: string;
  quantity: number; // Can be positive (add) or negative (remove)
  reason: string;
  userId?: string;
}

export interface TransactionResult {
  ledgerEntries: LedgerEntry[];
  eventId: string;
}

// =============================================================================
// EVENT OUTBOX TYPES
// =============================================================================

interface OutboxEvent {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

// =============================================================================
// HELPER: Create ledger entry with client (within transaction)
// =============================================================================

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

  // Validate non-negative stock (except for adjustments)
  if (newQty < 0 && input.transactionType !== 'adjustment') {
    throw new Error(
      `Insufficient stock for product ${input.productId}. Current: ${currentQty}, Requested: ${Math.abs(input.deltaQty)}`
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

  return ledgerEntry;
}

// =============================================================================
// HELPER: Write to event outbox (within transaction)
// =============================================================================

async function writeToOutbox(client: PoolClient, event: OutboxEvent): Promise<string> {
  const result = await client.query(
    `INSERT INTO inventory.event_outbox (
      event_type, aggregate_type, aggregate_id, payload
    ) VALUES ($1, $2, $3, $4)
    RETURNING id`,
    [event.eventType, event.aggregateType, event.aggregateId, JSON.stringify(event.payload)]
  );
  return result.rows[0].id;
}

// =============================================================================
// TRANSACTION OPERATIONS
// =============================================================================

/**
 * Create an inventory transaction with event outbox integration.
 * All operations happen in a single atomic transaction.
 *
 * Sign application:
 * - sale: -quantity (decrease)
 * - sale_return: +quantity (increase)
 * - purchase_received: +quantity (increase)
 * - adjustment: ±quantity (as specified)
 */
export async function createTransaction(
  input: CreateTransactionInput
): Promise<TransactionResult> {
  // Validate items
  if (!input.items || input.items.length === 0) {
    throw ApiError.badRequest('At least one item is required');
  }

  // Validate all quantities are positive integers (sign applied by service)
  for (const item of input.items) {
    if (!Number.isInteger(item.quantity)) {
      throw ApiError.badRequest(`Quantity must be integer for product ${item.productId}`);
    }
    if (item.quantity <= 0) {
      throw ApiError.badRequest(`Quantity must be positive for product ${item.productId}`);
    }
  }

  // Determine sign based on transaction type
  let signMultiplier: number;
  switch (input.transactionType) {
    case 'sale':
      signMultiplier = -1;
      break;
    case 'sale_return':
    case 'purchase_received':
    case 'opening_stock':
      // All increase stock
      signMultiplier = 1;
      break;
    case 'adjustment':
      // For batch adjustments, we expect positive values and apply as increase
      // For explicit +/- adjustments, use the adjust endpoint
      signMultiplier = 1;
      break;
    default:
      throw ApiError.badRequest(`Invalid transaction type: ${input.transactionType}`);
  }

  const client = await getClient();
  const ledgerEntries: LedgerEntry[] = [];

  try {
    await client.query('BEGIN');

    // Create ledger entries for each item
    for (const item of input.items) {
      const ledgerInput: CreateLedgerEntryInput = {
        storeId: input.storeId,
        productId: item.productId,
        deltaQty: item.quantity * signMultiplier,
        transactionType: input.transactionType,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        referenceSubId: input.referenceSubId,
        unitCost: item.unitCost,
        createdByUserId: input.userId,
        notes: input.notes,
      };

      const entry = await createLedgerEntryWithClient(client, ledgerInput);
      ledgerEntries.push(entry);
    }

    // Write event to outbox
    const eventPayload = {
      storeId: input.storeId,
      transactionType: input.transactionType,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      referenceSubId: input.referenceSubId,
      items: ledgerEntries.map((e) => ({
        productId: e.productId,
        deltaQty: e.deltaQty,
        stockBefore: e.stockBefore,
        stockAfter: e.stockAfter,
        ledgerId: e.id,
      })),
      userId: input.userId,
      timestamp: new Date().toISOString(),
    };

    const eventId = await writeToOutbox(client, {
      eventType: `inventory.${input.transactionType}`,
      aggregateType: 'inventory',
      aggregateId: input.storeId,
      payload: eventPayload,
    });

    await client.query('COMMIT');

    return { ledgerEntries, eventId };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof Error && error.message.includes('Insufficient stock')) {
      throw ApiError.badRequest(error.message);
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Adjust stock for a single product (can be positive or negative).
 * Used for manual inventory corrections, shrinkage, etc.
 */
export async function adjustStock(input: AdjustmentInput): Promise<TransactionResult> {
  // Validate quantity is integer
  if (!Number.isInteger(input.quantity)) {
    throw ApiError.badRequest('Quantity must be an integer');
  }

  // Quantity can be positive (add) or negative (remove)
  if (input.quantity === 0) {
    throw ApiError.badRequest('Quantity cannot be zero');
  }

  if (!input.reason || input.reason.trim().length === 0) {
    throw ApiError.badRequest('Reason is required for adjustments');
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Create ledger entry with quantity as-is (already signed)
    const ledgerInput: CreateLedgerEntryInput = {
      storeId: input.storeId,
      productId: input.productId,
      deltaQty: input.quantity,
      transactionType: 'adjustment',
      referenceType: 'manual',
      createdByUserId: input.userId,
      notes: input.reason,
    };

    const ledgerEntry = await createLedgerEntryWithClient(client, ledgerInput);

    // Write event to outbox
    const eventPayload = {
      storeId: input.storeId,
      productId: input.productId,
      deltaQty: input.quantity,
      stockBefore: ledgerEntry.stockBefore,
      stockAfter: ledgerEntry.stockAfter,
      ledgerId: ledgerEntry.id,
      reason: input.reason,
      userId: input.userId,
      timestamp: new Date().toISOString(),
    };

    const eventId = await writeToOutbox(client, {
      eventType: 'inventory.adjustment',
      aggregateType: 'inventory',
      aggregateId: input.storeId,
      payload: eventPayload,
    });

    await client.query('COMMIT');

    return { ledgerEntries: [ledgerEntry], eventId };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof Error && error.message.includes('Insufficient stock')) {
      throw ApiError.badRequest(error.message);
    }
    throw error;
  } finally {
    client.release();
  }
}

// Re-export types
export type { LedgerEntry, TransactionType, ReferenceType };
