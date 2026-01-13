// Order API Service - V3.0.9 compliant
// Frontend API client for purchase order operations

import { apiClient } from "./apiClient";

// =============================================================================
// TYPES
// =============================================================================

export type OrderStatus =
  | "draft"
  | "submitted"
  | "confirmed"
  | "shipped"
  | "partially_received"
  | "received"
  | "cancelled";

export type OrderType = "manual" | "reorder";

export interface PurchaseOrderItem {
  id: string;
  orderId: string;
  supplierProductId: string;
  productId: string;
  productName: string;
  barcode: string | null;
  orderedQuantity: number;
  receivedQuantity: number;
  unitPrice: number;
  totalPrice: number;
  status: "pending" | "partial" | "received";
  notes: string | null;
}

export interface PurchaseOrder {
  id: string;
  orderNumber: string;
  storeId: string;
  supplierId: string;
  supplierName: string;
  orderType: OrderType;
  status: OrderStatus;
  totalAmount: number;
  itemCount: number;
  storeNotes: string | null;
  supplierNotes: string | null;
  deliveryAddress: string | null;
  expectedDeliveryDate: string | null;
  actualDeliveryDate: string | null;
  trackingNumber: string | null;
  carrier: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderWithItems extends PurchaseOrder {
  items: PurchaseOrderItem[];
}

export interface OrderEvent {
  id: string;
  orderId: string;
  eventType: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus | null;
  actorId: string | null;
  actorType: "user" | "system" | "supplier";
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ListOrdersParams {
  status?: OrderStatus | OrderStatus[];
  supplierId?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
}

export interface ListOrdersResponse {
  success: boolean;
  data: PurchaseOrder[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface GetOrderResponse {
  success: boolean;
  data: PurchaseOrderWithItems;
}

export interface GetEventsResponse {
  success: boolean;
  data: OrderEvent[];
}

export interface TransitionResponse {
  success: boolean;
  data: PurchaseOrder;
  transition: {
    from: OrderStatus;
    to: OrderStatus;
  };
}

export interface CreateOrderParams {
  supplierId: string;
  orderType: OrderType;
  items?: Array<{
    supplierProductId: string;
    quantity: number;
    unitPrice: number;
  }>;
  reorderIds?: string[];
  storeNotes?: string;
  deliveryAddress?: string;
  expectedDeliveryDate?: string;
}

export interface CreateOrderResponse {
  success: boolean;
  data: PurchaseOrderWithItems;
}

// GRN (Goods Received Note) Types
export interface ReceiveItemInput {
  orderItemId: string;
  quantityReceived: number;
  notes?: string;
}

export interface ReceiveGoodsParams {
  items: ReceiveItemInput[];
  notes?: string;
}

export interface ReceiveRecord {
  id: string;
  orderId: string;
  receivedByUserId: string | null;
  notes: string | null;
  createdAt: string;
}

export interface ReceiveRecordItem {
  id: string;
  receiveRecordId: string;
  orderItemId: string;
  productId: string;
  productName: string;
  quantityReceived: number;
  notes: string | null;
}

export interface ReceiveRecordWithItems extends ReceiveRecord {
  items: ReceiveRecordItem[];
}

export interface UpdatedOrderItem {
  id: string;
  productName: string;
  orderedQuantity: number;
  receivedQuantity: number;
  status: "pending" | "partial" | "received";
}

export interface ReceiveGoodsResponse {
  success: boolean;
  data: {
    receiveRecord: ReceiveRecord;
    order: {
      id: string;
      orderNumber: string;
      status: OrderStatus;
    };
    itemsUpdated: UpdatedOrderItem[];
  };
}

export interface ListReceivesResponse {
  success: boolean;
  data: ReceiveRecord[];
}

export interface GetReceiveResponse {
  success: boolean;
  data: ReceiveRecordWithItems;
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

const ORDER_BASE = "/api/v1/orders";

/**
 * List purchase orders for a store.
 * V3.0.9: Supports multi-status filter via comma-separated values.
 */
export async function listOrders(
  storeId: string,
  params?: ListOrdersParams
): Promise<ListOrdersResponse> {
  const query = new URLSearchParams();

  if (params?.status) {
    const statusStr = Array.isArray(params.status)
      ? params.status.join(",")
      : params.status;
    query.set("status", statusStr);
  }
  if (params?.supplierId) {
    query.set("supplierId", params.supplierId);
  }
  if (params?.fromDate) {
    query.set("fromDate", params.fromDate);
  }
  if (params?.toDate) {
    query.set("toDate", params.toDate);
  }
  if (params?.page && params.page > 0) {
    query.set("page", String(params.page));
  }
  if (params?.limit && params.limit > 0) {
    query.set("limit", String(params.limit));
  }

  const queryString = query.toString();
  const path = `${ORDER_BASE}/stores/${storeId}/orders${queryString ? `?${queryString}` : ""}`;

  return apiClient.get<ListOrdersResponse>(path);
}

/**
 * Get a single purchase order with items.
 */
export async function getOrder(
  storeId: string,
  orderId: string
): Promise<PurchaseOrderWithItems> {
  const path = `${ORDER_BASE}/stores/${storeId}/orders/${orderId}`;
  const response = await apiClient.get<GetOrderResponse>(path);
  return response.data;
}

/**
 * Create a new purchase order.
 */
export async function createOrder(
  storeId: string,
  params: CreateOrderParams
): Promise<PurchaseOrderWithItems> {
  const path = `${ORDER_BASE}/stores/${storeId}/orders`;
  const response = await apiClient.post<CreateOrderResponse>(path, params);
  return response.data;
}

/**
 * Get order events (status timeline).
 */
export async function getOrderEvents(
  storeId: string,
  orderId: string
): Promise<OrderEvent[]> {
  const path = `${ORDER_BASE}/stores/${storeId}/orders/${orderId}/events`;
  const response = await apiClient.get<GetEventsResponse>(path);
  return response.data;
}

/**
 * Submit a draft order.
 */
export async function submitOrder(
  storeId: string,
  orderId: string
): Promise<TransitionResponse> {
  const path = `${ORDER_BASE}/stores/${storeId}/orders/${orderId}/submit`;
  return apiClient.post<TransitionResponse>(path);
}

/**
 * Cancel an order.
 */
export async function cancelOrder(
  storeId: string,
  orderId: string,
  reason?: string
): Promise<TransitionResponse> {
  const path = `${ORDER_BASE}/stores/${storeId}/orders/${orderId}/cancel`;
  return apiClient.post<TransitionResponse>(path, { reason });
}

/**
 * Confirm a submitted order.
 */
export async function confirmOrder(
  storeId: string,
  orderId: string
): Promise<TransitionResponse> {
  const path = `${ORDER_BASE}/stores/${storeId}/orders/${orderId}/confirm`;
  return apiClient.post<TransitionResponse>(path);
}

/**
 * Mark order as shipped.
 */
export async function shipOrder(
  storeId: string,
  orderId: string,
  trackingInfo?: { trackingNumber?: string; carrier?: string }
): Promise<TransitionResponse> {
  const path = `${ORDER_BASE}/stores/${storeId}/orders/${orderId}/ship`;
  return apiClient.post<TransitionResponse>(path, trackingInfo);
}

// =============================================================================
// GRN (GOODS RECEIVING) API FUNCTIONS
// =============================================================================

/**
 * Receive goods for a purchase order (GRN).
 * Creates a receive record and updates inventory.
 */
export async function receiveGoods(
  storeId: string,
  orderId: string,
  params: ReceiveGoodsParams
): Promise<ReceiveGoodsResponse> {
  const path = `${ORDER_BASE}/stores/${storeId}/orders/${orderId}/receive`;
  return apiClient.post<ReceiveGoodsResponse>(path, params);
}

/**
 * Get receive history for an order.
 */
export async function getReceiveRecords(
  storeId: string,
  orderId: string
): Promise<ReceiveRecord[]> {
  const path = `${ORDER_BASE}/stores/${storeId}/orders/${orderId}/receives`;
  const response = await apiClient.get<ListReceivesResponse>(path);
  return response.data;
}

/**
 * Get a specific receive record with items.
 */
export async function getReceiveRecord(
  storeId: string,
  orderId: string,
  receiveId: string
): Promise<ReceiveRecordWithItems> {
  const path = `${ORDER_BASE}/stores/${storeId}/orders/${orderId}/receives/${receiveId}`;
  const response = await apiClient.get<GetReceiveResponse>(path);
  return response.data;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get display label for order status.
 */
export function getStatusLabel(status: OrderStatus): string {
  const labels: Record<OrderStatus, string> = {
    draft: "Draft",
    submitted: "Submitted",
    confirmed: "Confirmed",
    shipped: "Shipped",
    partially_received: "Partially Received",
    received: "Received",
    cancelled: "Cancelled",
  };
  return labels[status] ?? status;
}

/**
 * Get color for order status.
 */
export function getStatusColor(status: OrderStatus): string {
  const colors: Record<OrderStatus, string> = {
    draft: "#64748B", // gray
    submitted: "#F59E0B", // warning/yellow
    confirmed: "#3B82F6", // blue
    shipped: "#8B5CF6", // purple
    partially_received: "#14B8A6", // teal
    received: "#16A34A", // success/green
    cancelled: "#DC2626", // error/red
  };
  return colors[status] ?? "#64748B";
}

/**
 * Check if order can be cancelled.
 */
export function canCancel(status: OrderStatus): boolean {
  return ["draft", "submitted", "confirmed"].includes(status);
}

/**
 * Check if order can be received (GRN).
 */
export function canReceive(status: OrderStatus): boolean {
  return ["shipped", "partially_received", "confirmed"].includes(status);
}

/**
 * Get order progress percentage.
 */
export function getOrderProgress(status: OrderStatus): number {
  const progress: Record<OrderStatus, number> = {
    draft: 0,
    submitted: 20,
    confirmed: 40,
    shipped: 60,
    partially_received: 80,
    received: 100,
    cancelled: 0,
  };
  return progress[status] ?? 0;
}

/**
 * Format order number for display.
 */
export function formatOrderNumber(orderNumber: string): string {
  return `#${orderNumber}`;
}
