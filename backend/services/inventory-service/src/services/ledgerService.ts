// Ledger Service - V3.0.9 compliant
// Business logic for inventory ledger and stock balance operations

import { ApiError } from '@supermandi/common';
import {
  LedgerEntry,
  StockBalance,
  CreateLedgerEntryInput,
  TransactionType,
  ReferenceType,
  getCurrentStock,
  getStockBalance,
  getAllStockBalancesForStore,
  getLowStockProducts,
  getLedgerEntriesForProduct,
  getLedgerEntriesByReference,
  getRecentLedgerEntriesForStore,
  createLedgerEntryWithBalanceUpdate,
  createBatchLedgerEntries,
} from '../db/queries';

// =============================================================================
// STOCK LOOKUP OPERATIONS
// =============================================================================

export interface StockLookupResult {
  storeId: string;
  productId: string;
  currentQty: number;
  lastUpdated?: Date;
}

export async function getStock(storeId: string, productId: string): Promise<StockLookupResult> {
  const balance = await getStockBalance(storeId, productId);
  return {
    storeId,
    productId,
    currentQty: balance?.currentQty ?? 0,
    lastUpdated: balance?.updatedAt,
  };
}

export async function getStockForMultipleProducts(
  storeId: string,
  productIds: string[]
): Promise<StockLookupResult[]> {
  const balances = await getAllStockBalancesForStore(storeId);
  const balanceMap = new Map(balances.map((b) => [b.productId, b]));

  return productIds.map((productId) => {
    const balance = balanceMap.get(productId);
    return {
      storeId,
      productId,
      currentQty: balance?.currentQty ?? 0,
      lastUpdated: balance?.updatedAt,
    };
  });
}

export async function listStoreInventory(storeId: string): Promise<StockBalance[]> {
  return getAllStockBalancesForStore(storeId);
}

export async function listLowStockProducts(
  storeId: string,
  threshold: number
): Promise<StockBalance[]> {
  if (threshold < 0) {
    throw ApiError.badRequest('Threshold must be non-negative');
  }
  return getLowStockProducts(storeId, threshold);
}

// =============================================================================
// LEDGER HISTORY OPERATIONS
// =============================================================================

export async function getProductLedgerHistory(
  storeId: string,
  productId: string,
  limit: number = 50
): Promise<LedgerEntry[]> {
  return getLedgerEntriesForProduct(storeId, productId, limit);
}

export async function getReferenceLedgerHistory(
  referenceType: ReferenceType,
  referenceId: string
): Promise<LedgerEntry[]> {
  return getLedgerEntriesByReference(referenceType, referenceId);
}

export async function getStoreRecentActivity(
  storeId: string,
  limit: number = 100
): Promise<LedgerEntry[]> {
  return getRecentLedgerEntriesForStore(storeId, limit);
}

// =============================================================================
// LEDGER WRITE OPERATIONS
// =============================================================================

export interface RecordStockMovementInput {
  storeId: string;
  productId: string;
  quantity: number; // Positive value - sign determined by transactionType
  transactionType: TransactionType;
  referenceType?: ReferenceType;
  referenceId?: string;
  referenceSubId?: string;
  unitCost?: number;
  userId?: string;
  notes?: string;
}

/**
 * Record a stock movement with automatic sign application based on transaction type.
 * Client sends positive quantity; service applies sign based on transaction type:
 * - sale: -quantity (decrease)
 * - sale_return: +quantity (increase)
 * - purchase_received: +quantity (increase)
 * - adjustment: ±quantity (as specified, can be negative)
 */
export async function recordStockMovement(
  input: RecordStockMovementInput
): Promise<LedgerEntry> {
  // Validate quantity is integer
  if (!Number.isInteger(input.quantity)) {
    throw ApiError.badRequest('Quantity must be an integer');
  }

  // Apply sign based on transaction type
  let deltaQty: number;
  switch (input.transactionType) {
    case 'sale':
      // Sales decrease stock
      if (input.quantity <= 0) {
        throw ApiError.badRequest('Sale quantity must be positive');
      }
      deltaQty = -input.quantity;
      break;

    case 'sale_return':
      // Returns increase stock
      if (input.quantity <= 0) {
        throw ApiError.badRequest('Return quantity must be positive');
      }
      deltaQty = input.quantity;
      break;

    case 'purchase_received':
      // Purchases increase stock
      if (input.quantity <= 0) {
        throw ApiError.badRequest('Purchase quantity must be positive');
      }
      deltaQty = input.quantity;
      break;

    case 'adjustment':
      // Adjustments can be positive or negative
      deltaQty = input.quantity;
      break;

    case 'opening_stock':
      // Opening stock increases stock (initial inventory from retailer portal)
      if (input.quantity <= 0) {
        throw ApiError.badRequest('Opening stock quantity must be positive');
      }
      deltaQty = input.quantity;
      break;

    default:
      throw ApiError.badRequest(`Invalid transaction type: ${input.transactionType}`);
  }

  const ledgerInput: CreateLedgerEntryInput = {
    storeId: input.storeId,
    productId: input.productId,
    deltaQty,
    transactionType: input.transactionType,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    referenceSubId: input.referenceSubId,
    unitCost: input.unitCost,
    createdByUserId: input.userId,
    notes: input.notes,
  };

  try {
    return await createLedgerEntryWithBalanceUpdate(ledgerInput);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Insufficient stock')) {
      throw ApiError.badRequest(error.message);
    }
    throw error;
  }
}

export interface BatchStockMovementInput {
  storeId: string;
  items: Array<{
    productId: string;
    quantity: number;
    unitCost?: number;
  }>;
  transactionType: TransactionType;
  referenceType?: ReferenceType;
  referenceId?: string;
  referenceSubId?: string;
  userId?: string;
  notes?: string;
}

/**
 * Record multiple stock movements in a single atomic transaction.
 * All-or-nothing: if any item fails, entire batch is rolled back.
 */
export async function recordBatchStockMovement(
  input: BatchStockMovementInput
): Promise<LedgerEntry[]> {
  if (input.items.length === 0) {
    throw ApiError.badRequest('At least one item is required');
  }

  // Validate all quantities are integers
  for (const item of input.items) {
    if (!Number.isInteger(item.quantity)) {
      throw ApiError.badRequest(`Quantity must be integer for product ${item.productId}`);
    }
  }

  // Determine sign multiplier based on transaction type
  let signMultiplier: number;
  switch (input.transactionType) {
    case 'sale':
      signMultiplier = -1;
      // Validate all quantities positive
      if (input.items.some((i) => i.quantity <= 0)) {
        throw ApiError.badRequest('All sale quantities must be positive');
      }
      break;

    case 'sale_return':
    case 'purchase_received':
      signMultiplier = 1;
      // Validate all quantities positive
      if (input.items.some((i) => i.quantity <= 0)) {
        throw ApiError.badRequest('All quantities must be positive');
      }
      break;

    case 'adjustment':
      signMultiplier = 1; // Adjustments use quantity as-is
      break;

    default:
      throw ApiError.badRequest(`Invalid transaction type: ${input.transactionType}`);
  }

  const entries: CreateLedgerEntryInput[] = input.items.map((item) => ({
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
  }));

  try {
    return await createBatchLedgerEntries(entries);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Insufficient stock')) {
      throw ApiError.badRequest(error.message);
    }
    throw error;
  }
}

// Re-export types
export type { LedgerEntry, StockBalance, TransactionType, ReferenceType };
