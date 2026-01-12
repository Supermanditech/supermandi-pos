// Purchase Order Service - V3.0.9 compliant
// Business logic for creating and managing purchase orders

import { getClient, ApiError, ERROR_CODES } from '@supermandi/common';
import {
  getStoreCodeById,
  getSupplierSummary,
  getSupplierStoreLink,
  getSupplierProductSnapshots,
  getPendingReordersByIds,
  markPendingReordersApproved,
  createPurchaseOrderWithClient,
  createPurchaseOrderWithOutbox,
  getPurchaseOrderByIdAndStore,
  getPurchaseOrderItems,
  listPurchaseOrders,
  CreatePurchaseOrderInput,
  CreatePurchaseOrderItemInput,
  PurchaseOrder,
  PurchaseOrderItem,
  ListPurchaseOrdersFilters,
  ListPurchaseOrdersResult,
  OrderStatus,
} from '../db/queries.js';
import { generateOrderNumber } from './orderNumberService.js';

// =============================================================================
// TYPES
// =============================================================================

export interface CartItem {
  supplierProductId: string;
  quantity: number;
}

export interface CreateManualOrderInput {
  storeId: string;
  supplierId: string;
  items: CartItem[];
  storeNotes?: string;
  deliveryAddress?: string;
  expectedDeliveryDate?: string;
  createdByUserId?: string;
}

export interface CreateReorderInput {
  storeId: string;
  supplierId: string;
  reorderIds: string[];
  storeNotes?: string;
  deliveryAddress?: string;
  expectedDeliveryDate?: string;
  createdByUserId?: string;
}

export interface PurchaseOrderWithItems extends PurchaseOrder {
  items: PurchaseOrderItem[];
  supplierName?: string;
}

// =============================================================================
// CREATE FROM CART (Manual Order)
// =============================================================================

/**
 * Create a purchase order from cart items (manual order).
 * Fetches product details from supplier catalog and generates order number.
 */
export async function createPurchaseOrderFromCart(
  input: CreateManualOrderInput
): Promise<PurchaseOrder> {
  // Validate store exists and get store code
  const storeCode = await getStoreCodeById(input.storeId);
  if (!storeCode) {
    throw new ApiError(
      404,
      ERROR_CODES.NOT_FOUND,
      `Store not found: ${input.storeId}`
    );
  }

  // Validate supplier exists
  const supplier = await getSupplierSummary(input.supplierId);
  if (!supplier) {
    throw new ApiError(
      404,
      ERROR_CODES.NOT_FOUND,
      `Supplier not found: ${input.supplierId}`
    );
  }

  // Get supplier product details
  const supplierProductIds = input.items.map((item) => item.supplierProductId);
  const products = await getSupplierProductSnapshots(
    input.supplierId,
    supplierProductIds
  );

  // Build product map for lookup
  const productMap = new Map(
    products.map((p) => [p.supplierProductId, p])
  );

  // Validate all products exist
  const missingProducts = supplierProductIds.filter(
    (id) => !productMap.has(id)
  );
  if (missingProducts.length > 0) {
    throw new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      `Products not found for supplier: ${missingProducts.join(', ')}`
    );
  }

  // V3.0.9: Validate MOQ for each item
  const moqViolations: string[] = [];
  for (const item of input.items) {
    const product = productMap.get(item.supplierProductId)!;
    if (item.quantity < product.moq) {
      moqViolations.push(
        `${product.productName}: quantity ${item.quantity} is below MOQ ${product.moq}`
      );
    }
  }
  if (moqViolations.length > 0) {
    throw new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      `MOQ validation failed: ${moqViolations.join('; ')}`
    );
  }

  // V3.0.9: Validate minimum order value
  const supplierLink = await getSupplierStoreLink(input.supplierId, input.storeId);
  const minOrderValue = supplierLink?.minOrderValue ?? 0;

  if (minOrderValue > 0) {
    let orderTotal = 0;
    for (const item of input.items) {
      const product = productMap.get(item.supplierProductId)!;
      orderTotal += item.quantity * product.unitPrice;
    }

    if (orderTotal < minOrderValue) {
      throw new ApiError(
        400,
        ERROR_CODES.VALIDATION_ERROR,
        `Order total ${orderTotal.toFixed(2)} is below minimum order value ${minOrderValue.toFixed(2)} for this supplier`
      );
    }
  }

  // Generate order number
  const orderNumber = await generateOrderNumber(storeCode, input.storeId);

  // Build order items
  const orderItems: CreatePurchaseOrderItemInput[] = input.items.map((item) => {
    const product = productMap.get(item.supplierProductId)!;
    const lineTotal = item.quantity * product.unitPrice;

    return {
      supplierProductId: product.supplierProductId,
      productId: product.productId,
      productName: product.productName,
      supplierSku: product.supplierSku,
      barcode: product.barcode,
      quantityOrdered: item.quantity,
      unitPrice: product.unitPrice,
      mrp: product.mrp,
      taxRate: 0,
      discountPercent: 0,
      lineTotal,
    };
  });

  // Create the order
  const orderInput: CreatePurchaseOrderInput = {
    storeId: input.storeId,
    supplierId: input.supplierId,
    orderNumber,
    orderType: 'manual',
    items: orderItems,
    storeNotes: input.storeNotes,
    deliveryAddress: input.deliveryAddress,
    expectedDeliveryDate: input.expectedDeliveryDate,
    createdByUserId: input.createdByUserId,
  };

  return createPurchaseOrderWithOutbox(orderInput);
}

// =============================================================================
// CREATE FROM REORDERS
// =============================================================================

/**
 * Create a purchase order from pending reorder suggestions.
 * Links the PO to reorder records and marks them as approved.
 */
export async function createPurchaseOrderFromReorders(
  input: CreateReorderInput
): Promise<PurchaseOrder> {
  // Validate store exists and get store code
  const storeCode = await getStoreCodeById(input.storeId);
  if (!storeCode) {
    throw new ApiError(
      404,
      ERROR_CODES.NOT_FOUND,
      `Store not found: ${input.storeId}`
    );
  }

  // Validate supplier exists
  const supplier = await getSupplierSummary(input.supplierId);
  if (!supplier) {
    throw new ApiError(
      404,
      ERROR_CODES.NOT_FOUND,
      `Supplier not found: ${input.supplierId}`
    );
  }

  // Get pending reorders
  const reorders = await getPendingReordersByIds(input.storeId, input.reorderIds);

  // Validate all reorders exist and are pending
  if (reorders.length !== input.reorderIds.length) {
    const foundIds = new Set(reorders.map((r) => r.id));
    const missingIds = input.reorderIds.filter((id) => !foundIds.has(id));
    throw new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      `Reorder records not found or already processed: ${missingIds.join(', ')}`
    );
  }

  // Validate all reorders are for the same supplier
  const wrongSupplier = reorders.filter(
    (r) => r.suggestedSupplierId && r.suggestedSupplierId !== input.supplierId
  );
  if (wrongSupplier.length > 0) {
    throw new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      `Some reorder items are for a different supplier`
    );
  }

  // Get supplier product details for reorders that have supplierProductId
  const supplierProductIds = reorders
    .filter((r) => r.supplierProductId)
    .map((r) => r.supplierProductId!);

  const products =
    supplierProductIds.length > 0
      ? await getSupplierProductSnapshots(input.supplierId, supplierProductIds)
      : [];

  const productMap = new Map(
    products.map((p) => [p.supplierProductId, p])
  );

  // Generate order number
  const orderNumber = await generateOrderNumber(storeCode, input.storeId);

  // Build order items from reorders
  const orderItems: CreatePurchaseOrderItemInput[] = reorders.map((reorder) => {
    const product = reorder.supplierProductId
      ? productMap.get(reorder.supplierProductId)
      : null;

    const unitPrice = product?.unitPrice ?? reorder.suggestedUnitPrice ?? 0;
    const lineTotal = reorder.suggestedQuantity * unitPrice;

    return {
      supplierProductId: reorder.supplierProductId ?? '',
      productId: reorder.productId,
      productName: reorder.productName,
      supplierSku: product?.supplierSku,
      barcode: reorder.barcode,
      quantityOrdered: reorder.suggestedQuantity,
      unitPrice,
      mrp: product?.mrp,
      taxRate: 0,
      discountPercent: 0,
      lineTotal,
    };
  });

  // Create order in transaction with reorder updates
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Create the purchase order
    const orderInput: CreatePurchaseOrderInput = {
      storeId: input.storeId,
      supplierId: input.supplierId,
      orderNumber,
      orderType: 'reorder',
      sourceReorderIds: input.reorderIds,
      items: orderItems,
      storeNotes: input.storeNotes,
      deliveryAddress: input.deliveryAddress,
      expectedDeliveryDate: input.expectedDeliveryDate,
      createdByUserId: input.createdByUserId,
    };

    const order = await createPurchaseOrderWithClient(client, orderInput);

    // Mark reorders as approved
    await markPendingReordersApproved(client, input.reorderIds, order.id);

    await client.query('COMMIT');
    return order;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// =============================================================================
// GET ORDER WITH ITEMS
// =============================================================================

/**
 * Get a purchase order with its items, validated against store.
 */
export async function getPurchaseOrderWithItems(
  orderId: string,
  storeId: string
): Promise<PurchaseOrderWithItems | null> {
  const order = await getPurchaseOrderByIdAndStore(orderId, storeId);
  if (!order) {
    return null;
  }

  const items = await getPurchaseOrderItems(orderId);
  const supplier = await getSupplierSummary(order.supplierId);

  return {
    ...order,
    items,
    supplierName: supplier?.businessName,
  };
}

// =============================================================================
// LIST ORDERS
// =============================================================================

/**
 * List purchase orders for a store with filters.
 * Supports multi-status filtering (V3.0.9).
 */
export async function listStoreOrders(
  storeId: string,
  options: {
    statuses?: OrderStatus[];
    supplierId?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
    limit?: number;
  } = {}
): Promise<ListPurchaseOrdersResult> {
  const filters: ListPurchaseOrdersFilters = {
    storeId,
    statuses: options.statuses,
    supplierId: options.supplierId,
    fromDate: options.fromDate,
    toDate: options.toDate,
    page: options.page ?? 1,
    limit: Math.min(options.limit ?? 20, 100),
  };

  return listPurchaseOrders(filters);
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Parse comma-separated status string into OrderStatus array.
 * V3.0.9: Multi-status filter support.
 */
export function parseStatusFilter(statusParam?: string): OrderStatus[] | undefined {
  if (!statusParam) return undefined;

  const validStatuses: OrderStatus[] = [
    'draft',
    'submitted',
    'confirmed',
    'shipped',
    'partial_received',
    'delivered',
    'cancelled',
  ];

  const statuses = statusParam
    .split(',')
    .map((s) => s.trim().toLowerCase() as OrderStatus)
    .filter((s) => validStatuses.includes(s));

  return statuses.length > 0 ? statuses : undefined;
}
