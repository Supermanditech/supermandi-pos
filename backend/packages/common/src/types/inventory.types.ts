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

// Store product list item — shape returned by GET /api/v1/pos/store-products/list
// Includes SCALE-A3/C1 batch traceability fields and SCALE-B1/E2 sell tile display fields
export interface StoreProductListItem {
  storeProductId: UUID;
  productId: UUID;
  name: string;
  barcode: string | null;
  sellPrice: number | null;
  mrp: number | null;
  purchasePrice: number | null;
  currentStock: number;
  brand: string | null;
  unit: string;
  category: string | null;
  displayName: string | null;
  mode: string | null;
  updatedAt: Date | string | null;
  metadataUpdatedAt: Date | string | null;
  // SCALE-C3: Expiry / batch traceability (SCALE-A3/C1)
  batch_number?: string | null;
  expiry_date?: string | null;
  // SCALE-B1/E2: Sell tile display fields
  image_url: string | null;
  gst_rate: number | null;
  net_content_value: number | null;
  net_content_unit: string | null;
}
