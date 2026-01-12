// Order types - V3.0.9 compliant

import { UUID, BaseEntity } from './base';

// Purchase order status
export type POStatus =
  | 'draft'
  | 'submitted'
  | 'confirmed'
  | 'shipped'
  | 'partial_received'
  | 'delivered'
  | 'cancelled';

// Order type
export type OrderType = 'manual' | 'reorder';

// Payment status
export type PaymentStatus = 'pending' | 'partial' | 'paid';

// Purchase order (orders.purchase_orders)
export interface PurchaseOrder extends BaseEntity {
  orderNumber: string;
  storeId: UUID;
  supplierId: UUID;
  orderType: OrderType;
  sourceReorderIds?: UUID[];
  status: POStatus;
  subtotal: number;
  taxAmount: number;
  deliveryCharges: number;
  discountAmount: number;
  totalAmount: number;
  expectedDeliveryDate?: Date;
  actualDeliveryDate?: Date;
  deliveryAddress?: string;
  paymentStatus: PaymentStatus;
  storeNotes?: string;
  supplierNotes?: string;
  createdByUserId?: UUID;
}

// Order item status
export type OrderItemStatus = 'pending' | 'partial' | 'received' | 'rejected';

// Purchase order item (orders.purchase_order_items)
export interface PurchaseOrderItem extends BaseEntity {
  orderId: UUID;
  supplierProductId: UUID;
  productId: UUID;
  productName: string;
  supplierSku?: string;
  barcode?: string;
  orderedQuantity: number;
  receivedQuantity: number;
  unitPrice: number;
  mrp?: number;
  taxRate: number;
  discountPercent: number;
  lineTotal: number;
  status: OrderItemStatus;
}

// Order event type
export type OrderEventType =
  | 'created'
  | 'submitted'
  | 'confirmed'
  | 'shipped'
  | 'received'
  | 'partial_received'
  | 'cancelled'
  | 'note_added';

// Order event (orders.order_events) - audit trail
export interface OrderEvent extends BaseEntity {
  orderId: UUID;
  eventType: OrderEventType;
  fromStatus?: POStatus;
  toStatus?: POStatus;
  actorType?: string;
  actorId?: UUID;
  actorName?: string;
  details?: Record<string, unknown>;
  notes?: string;
}

// Order sequence (orders.order_sequences) - atomic PO numbering
export interface OrderSequence {
  storeId: UUID;
  storeCode: string;
  currentYear: number;
  currentSeq: number;
  updatedAt: Date;
}

// PO with items (for API responses)
export interface PurchaseOrderWithItems extends PurchaseOrder {
  items: PurchaseOrderItem[];
  supplier: {
    id: UUID;
    businessName: string;
    primaryPhone?: string;
  };
}

// Valid status transitions
export const ValidPOTransitions: Record<POStatus, POStatus[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered', 'partial_received'],
  partial_received: ['delivered', 'partial_received'],
  delivered: [],
  cancelled: [],
};
