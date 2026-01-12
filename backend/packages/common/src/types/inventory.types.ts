// Inventory types - V3.0.9 compliant

import { UUID, BaseEntity } from './base';

// Transaction types for inventory ledger
export type TransactionType = 'sale' | 'sale_return' | 'purchase_received' | 'adjustment';

// Reference types for traceability
export type ReferenceType = 'sale' | 'po' | 'return' | 'manual';

// Inventory ledger entry (inventory.inventory_ledger) - SOURCE OF TRUTH
export interface InventoryLedger extends BaseEntity {
  storeId: UUID;
  productId: UUID;
  deltaQty: number; // Signed: negative for sale, positive for receive
  transactionType: TransactionType;
  referenceType?: ReferenceType;
  referenceId?: string;
  referenceSubId?: string; // V3.0.4: receiveId for partial GRN traceability
  stockBefore: number;
  stockAfter: number;
  unitCost?: number;
  createdByUserId?: UUID;
  notes?: string;
}

// Stock balance (inventory.stock_balances) - for row locking
export interface StockBalance {
  storeId: UUID;
  productId: UUID;
  currentQty: number;
  lastLedgerId?: UUID;
  updatedAt: Date;
}

// Idempotency key status
export type IdempotencyStatus = 'processing' | 'completed' | 'failed';

// Idempotency key record (inventory.idempotency_keys)
export interface IdempotencyKey {
  key: string;
  userId: UUID;
  route: string;
  requestHash?: string;
  status: IdempotencyStatus;
  responseStatus?: number;
  responseJson?: unknown;
  createdAt: Date;
  expiresAt: Date;
}

// Stock level info (for API responses)
export interface StockLevel {
  storeId: UUID;
  productId: UUID;
  productName: string;
  currentStock: number;
  lastUpdated: Date;
}

// Transaction result
export interface TransactionResult {
  transactionId: UUID;
  ledgerEntries: InventoryLedger[];
  stockAfter: Record<UUID, number>; // productId -> new stock
}
