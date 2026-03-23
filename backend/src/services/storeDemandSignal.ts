/**
 * V3-HARDEN-162: Per-store SKU sell-through and replenishment signal layer
 *
 * One canonical source of truth for store-SKU demand across all portals:
 * - POS app: updated stock + low-stock cues after sale
 * - Retailer web: stock, sales velocity, pending replenishment, delivery status
 * - Supplier web: allocated demand only (not raw store data)
 * - SuperAdmin: cross-store demand, low-stock pressure, fulfillment lag
 *
 * Derived from append-only events (sales, stock, GRN, orders),
 * NOT from overwritten summary rows.
 *
 * V3-FIX-163: Retailer reorder/fresh purchase signal
 * V3-FIX-164: SuperMandi→supplier demand allocation
 */

export type DemandSignalType =
  | "sale_completed"
  | "stock_updated"
  | "grn_confirmed"
  | "order_placed"
  | "order_delivered"
  | "low_stock_alert"
  | "reorder_suggested";

export interface StoreSKUDemandSnapshot {
  storeId: string;
  productId: string;
  /** Current available stock */
  currentStock: number;
  /** Units sold in last 7 days */
  soldLast7Days: number;
  /** Units sold in last 30 days */
  soldLast30Days: number;
  /** Average daily sales velocity */
  dailyVelocity: number;
  /** Estimated days until stockout at current velocity */
  daysOfStock: number;
  /** Units currently on order (pending delivery) */
  pendingInbound: number;
  /** Whether this SKU needs reorder attention */
  needsReorder: boolean;
  /** Last sale timestamp */
  lastSaleAt: string | null;
  /** Last stock update timestamp */
  lastStockEventAt: string | null;
}

/**
 * V3-FIX-163: Reorder recommendation for a store SKU
 */
export interface ReorderRecommendation {
  productId: string;
  productName: string;
  barcode: string | null;
  supplierId: string | null;
  supplierName: string | null;
  currentStock: number;
  dailyVelocity: number;
  daysOfStock: number;
  suggestedQuantity: number;
  /** Whether this is a repeat order (previously procured) or fresh */
  isRepeat: boolean;
  /** Last procurement order ID if repeat */
  lastOrderId: string | null;
}

/**
 * V3-FIX-164: Supplier demand allocation state
 */
export type AllocationStatus =
  | "pending_trigger"
  | "triggered"
  | "accepted"
  | "partial_accepted"
  | "rejected"
  | "dispatched"
  | "delivered"
  | "grn_completed";

export interface SupplierDemandAllocation {
  allocationId: string;
  retailerOrderId: string;
  supplierId: string;
  storeId: string;
  status: AllocationStatus;
  items: Array<{
    productId: string;
    orderedQuantity: number;
    acceptedQuantity: number;
    dispatchedQuantity: number;
    deliveredQuantity: number;
  }>;
  triggeredAt: string;
  acceptedAt: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
}

/**
 * Calculate reorder suggestion based on demand snapshot
 */
export function calculateReorderSuggestion(
  snapshot: StoreSKUDemandSnapshot,
  reorderThresholdDays: number = 7
): { needsReorder: boolean; suggestedQuantity: number } {
  if (snapshot.daysOfStock > reorderThresholdDays) {
    return { needsReorder: false, suggestedQuantity: 0 };
  }
  // Suggest enough stock for 14 days minus what's on order
  const targetDays = 14;
  const needed = Math.ceil(snapshot.dailyVelocity * targetDays) - snapshot.currentStock - snapshot.pendingInbound;
  return {
    needsReorder: needed > 0,
    suggestedQuantity: Math.max(0, needed),
  };
}

/**
 * V3-HARDEN-165: Lifecycle events for communication fan-out
 */
export type LifecycleEventType =
  | "order_created"
  | "supplier_action_required"
  | "supplier_accepted"
  | "supplier_rejected"
  | "partial_accept"
  | "dispatched"
  | "delivery_due"
  | "delivered"
  | "grn_completed"
  | "repeat_order_prompt"
  | "payment_completed"; // GCP-STG-0382: Payment lifecycle event

export interface LifecycleEvent {
  eventType: LifecycleEventType;
  orderId: string;
  storeId: string;
  supplierId: string | null;
  /** Who should be notified */
  targets: Array<{
    role: "retailer" | "supplier" | "admin";
    channels: ("in_app" | "whatsapp")[];
  }>;
  payload: Record<string, any>;
  timestamp: string;
}

/**
 * V3-HARDEN-165: Communication rules per event type
 */
export const LIFECYCLE_COMMUNICATION_RULES: Record<LifecycleEventType, {
  retailer: ("in_app" | "whatsapp")[];
  supplier: ("in_app" | "whatsapp")[];
  admin: ("in_app")[];
}> = {
  order_created:            { retailer: ["in_app", "whatsapp"], supplier: [],                    admin: ["in_app"] },
  supplier_action_required: { retailer: [],                     supplier: ["in_app", "whatsapp"], admin: ["in_app"] },
  supplier_accepted:        { retailer: ["in_app", "whatsapp"], supplier: ["in_app"],             admin: ["in_app"] },
  supplier_rejected:        { retailer: ["in_app", "whatsapp"], supplier: ["in_app"],             admin: ["in_app"] },
  partial_accept:           { retailer: ["in_app", "whatsapp"], supplier: ["in_app"],             admin: ["in_app"] },
  dispatched:               { retailer: ["in_app", "whatsapp"], supplier: ["in_app"],             admin: ["in_app"] },
  delivery_due:             { retailer: ["in_app", "whatsapp"], supplier: ["in_app"],             admin: ["in_app"] },
  delivered:                { retailer: ["in_app", "whatsapp"], supplier: ["in_app"],             admin: ["in_app"] },
  grn_completed:            { retailer: ["in_app", "whatsapp"], supplier: ["in_app"],             admin: ["in_app"] },
  repeat_order_prompt:      { retailer: ["in_app", "whatsapp"], supplier: [],                    admin: [] },
  // GCP-STG-0382: Payment completed — retailer gets WhatsApp confirmation + in_app + SSE
  payment_completed:        { retailer: ["in_app", "whatsapp"], supplier: [],                    admin: ["in_app"] },
};
