// Reorder types - V3.0.9 compliant

import { UUID, BaseEntity } from './base';

// Reorder policy (reorder.reorder_policies)
export interface ReorderPolicy extends BaseEntity {
  storeId: UUID;
  productId: UUID;
  minStock: number;
  targetStock: number;
  preferredSupplierId?: UUID;
  isEnabled: boolean;
  createdByUserId?: UUID;
}

// Store reorder settings (reorder.store_reorder_settings)
export interface StoreReorderSettings {
  storeId: UUID;
  reorderEnabled: boolean;
  requireApproval: boolean;
  notifyOnLowStock: boolean;
  updatedAt: Date;
}

// Pending reorder status
export type PendingReorderStatus = 'pending' | 'approved' | 'dismissed' | 'expired';

// Pending reorder (reorder.pending_reorders)
export interface PendingReorder extends BaseEntity {
  storeId: UUID;
  productId: UUID;
  productName: string;
  barcode?: string;
  currentStock: number;
  minThreshold: number;
  targetStock: number;
  suggestedQuantity: number;
  suggestedSupplierId?: UUID;
  suggestedSupplierName?: string;
  suggestedUnitPrice?: number;
  supplierProductId?: UUID;
  status: PendingReorderStatus;
  dismissedReason?: string;
  purchaseOrderId?: UUID;
  expiresAt: Date;
}

// Reorder run type
export type ReorderRunType = 'cron' | 'event';

// Reorder run status
export type ReorderRunStatus = 'success' | 'failed';

// Reorder run log (reorder.reorder_runs)
export interface ReorderRun extends BaseEntity {
  storeId: UUID;
  runType: ReorderRunType;
  startedAt: Date;
  finishedAt?: Date;
  evaluatedProducts: number;
  createdPending: number;
  skippedExisting: number;
  status: ReorderRunStatus;
  errorMessage?: string;
}

// Pending reorder with supplier info (for API responses)
export interface PendingReorderWithSupplier extends PendingReorder {
  supplier?: {
    id: UUID;
    businessName: string;
    minOrderValue: number;
  };
}

// Reorder suggestion for approval
export interface ReorderSuggestion {
  reorderId: UUID;
  productId: UUID;
  productName: string;
  currentStock: number;
  minThreshold: number;
  targetStock: number;
  suggestedQuantity: number;
  suggestedSupplier: {
    id: UUID;
    name: string;
    unitPrice: number;
  };
  estimatedTotal: number;
}
