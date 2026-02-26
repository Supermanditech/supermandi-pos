// Order Service Database Queries - V3.0.9 compliant
// CRUD operations for orders schema

import { query, queryOne, getClient, BaseEntity } from '@supermandi/common';
import { PoolClient } from 'pg';

// =============================================================================
// ORDER SEQUENCE TYPES
// =============================================================================

export interface OrderSequence {
  storeId: string;
  storeCode: string;
  currentYear: number;
  currentSeq: number;
  updatedAt: Date;
}

// =============================================================================
// ORDER SEQUENCE OPERATIONS
// =============================================================================

/**
 * Get next order sequence number atomically using FOR UPDATE locking.
 * Resets sequence when year changes.
 */
export async function getNextOrderSequence(
  storeId: string,
  storeCode: string,
  year: number
): Promise<number> {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const result = await client.query<{
      storeCode: string;
      currentYear: number;
      currentSeq: number;
    }>(
      `SELECT
        store_code as "storeCode",
        current_year as "currentYear",
        current_seq as "currentSeq"
      FROM orders.order_sequences
      WHERE store_id = $1
      FOR UPDATE`,
      [storeId]
    );

    let nextSeq: number;

    if (result.rows.length === 0) {
      nextSeq = 1;
      await client.query(
        `INSERT INTO orders.order_sequences (
          store_id, store_code, current_year, current_seq, updated_at
        ) VALUES ($1, $2, $3, $4, NOW())`,
        [storeId, storeCode, year, nextSeq]
      );
    } else {
      const row = result.rows[0];
      const effectiveStoreCode = storeCode || row.storeCode;

      if (row.currentYear !== year) {
        nextSeq = 1;
        await client.query(
          `UPDATE orders.order_sequences
           SET store_code = $2,
               current_year = $3,
               current_seq = $4,
               updated_at = NOW()
           WHERE store_id = $1`,
          [storeId, effectiveStoreCode, year, nextSeq]
        );
      } else {
        nextSeq = row.currentSeq + 1;
        await client.query(
          `UPDATE orders.order_sequences
           SET store_code = $2,
               current_seq = $3,
               updated_at = NOW()
           WHERE store_id = $1`,
          [storeId, effectiveStoreCode, nextSeq]
        );
      }
    }

    await client.query('COMMIT');
    return nextSeq;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get current sequence number without incrementing.
 */
export async function getCurrentOrderSequence(
  storeId: string,
  year: number
): Promise<number> {
  const result = await queryOne<{
    currentYear: number;
    currentSeq: number;
  }>(
    `SELECT
      current_year as "currentYear",
      current_seq as "currentSeq"
    FROM orders.order_sequences
    WHERE store_id = $1`,
    [storeId]
  );

  if (!result) return 0;
  return result.currentYear === year ? result.currentSeq : 0;
}

// =============================================================================
// STORE + SUPPLIER LOOKUPS
// =============================================================================

export async function getStoreCodeById(storeId: string): Promise<string | null> {
  const result = await queryOne<{ code: string }>(
    `SELECT code FROM platform.stores WHERE id = $1`,
    [storeId]
  );
  return result?.code ?? null;
}

export interface SupplierSummary {
  id: string;
  businessName: string;
  primaryPhone?: string;
}

export async function getSupplierSummary(
  supplierId: string
): Promise<SupplierSummary | null> {
  return queryOne<SupplierSummary>(
    `SELECT
      id,
      business_name as "businessName",
      primary_phone as "primaryPhone"
    FROM supplier.suppliers
    WHERE id = $1`,
    [supplierId]
  );
}

export interface SupplierStoreLink {
  supplierId: string;
  storeId: string;
  minOrderValue: number;
  creditDays: number;
  expectedDeliveryDays: number;
}

/**
 * Get supplier-store link for min order value validation.
 */
export async function getSupplierStoreLink(
  supplierId: string,
  storeId: string
): Promise<SupplierStoreLink | null> {
  return queryOne<SupplierStoreLink>(
    `SELECT
      supplier_id as "supplierId",
      store_id as "storeId",
      COALESCE(min_order_value, 0) as "minOrderValue",
      COALESCE(credit_days, 0) as "creditDays",
      COALESCE(expected_delivery_days, 3) as "expectedDeliveryDays"
    FROM supplier.supplier_store_links
    WHERE supplier_id = $1 AND store_id = $2 AND status = 'active'`,
    [supplierId, storeId]
  );
}

// =============================================================================
// SUPPLIER PRODUCT LOOKUP
// =============================================================================

export interface SupplierProductSnapshot {
  supplierProductId: string;
  supplierId: string;
  productId: string;
  productName: string;
  supplierSku?: string;
  barcode?: string;
  unitPrice: number;
  mrp?: number;
  moq: number;
}

export async function getSupplierProductSnapshots(
  supplierId: string,
  supplierProductIds: string[]
): Promise<SupplierProductSnapshot[]> {
  if (supplierProductIds.length === 0) {
    return [];
  }

  return query<SupplierProductSnapshot>(
    `SELECT
      sp.id as "supplierProductId",
      sp.supplier_id as "supplierId",
      spm.product_id as "productId",
      sp.name as "productName",
      sp.supplier_sku as "supplierSku",
      sp.barcode as "barcode",
      sp.purchase_price as "unitPrice",
      sp.mrp as "mrp",
      COALESCE(sp.moq, 1) as "moq"
    FROM catalog.supplier_products sp
    JOIN catalog.supplier_product_map spm
      ON spm.supplier_product_id = sp.id
    WHERE sp.id = ANY($1)
      AND sp.supplier_id = $2`,
    [supplierProductIds, supplierId]
  );
}

// =============================================================================
// REORDER PENDING LOOKUP
// =============================================================================

export type PendingReorderStatus = 'pending' | 'approved' | 'dismissed' | 'expired';

export interface PendingReorder extends BaseEntity {
  storeId: string;
  productId: string;
  productName: string;
  barcode?: string;
  currentStock: number;
  minThreshold: number;
  targetStock: number;
  suggestedQuantity: number;
  suggestedSupplierId?: string;
  suggestedSupplierName?: string;
  suggestedUnitPrice?: number;
  supplierProductId?: string;
  status: PendingReorderStatus;
  purchaseOrderId?: string;
  expiresAt: Date;
}

export async function getPendingReordersByIds(
  storeId: string,
  reorderIds: string[]
): Promise<PendingReorder[]> {
  if (reorderIds.length === 0) {
    return [];
  }

  return query<PendingReorder>(
    `SELECT
      id,
      store_id as "storeId",
      product_id as "productId",
      product_name as "productName",
      barcode,
      current_stock as "currentStock",
      min_threshold as "minThreshold",
      target_stock as "targetStock",
      suggested_quantity as "suggestedQuantity",
      suggested_supplier_id as "suggestedSupplierId",
      suggested_supplier_name as "suggestedSupplierName",
      suggested_unit_price as "suggestedUnitPrice",
      supplier_product_id as "supplierProductId",
      status,
      purchase_order_id as "purchaseOrderId",
      expires_at as "expiresAt",
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM reorder.pending_reorders
    WHERE store_id = $1 AND id = ANY($2)`,
    [storeId, reorderIds]
  );
}

export async function markPendingReordersApproved(
  client: PoolClient,
  reorderIds: string[],
  purchaseOrderId: string
): Promise<void> {
  if (reorderIds.length === 0) {
    return;
  }

  await client.query(
    `UPDATE reorder.pending_reorders
     SET status = 'approved',
         purchase_order_id = $2,
         updated_at = NOW()
     WHERE id = ANY($1)`,
    [reorderIds, purchaseOrderId]
  );
}

// T-250: Mark linked pending_reorders as 'fulfilled' when PO is delivered via GRN
export async function markPendingReordersFulfilled(
  client: PoolClient,
  purchaseOrderId: string
): Promise<number> {
  const result = await client.query(
    `UPDATE reorder.pending_reorders
     SET status = 'fulfilled',
         updated_at = NOW()
     WHERE purchase_order_id = $1
       AND status = 'approved'`,
    [purchaseOrderId]
  );
  return result.rowCount ?? 0;
}

// =============================================================================
// PURCHASE ORDER TYPES
// =============================================================================

export type OrderStatus =
  | 'draft'
  | 'submitted'
  | 'confirmed'
  | 'shipped'
  | 'partial_received'
  | 'delivered'
  | 'cancelled';

export type OrderType = 'manual' | 'reorder';

export type PaymentStatus = 'pending' | 'partial' | 'paid';

export type OrderItemStatus = 'pending' | 'partial' | 'received' | 'rejected';

export interface PurchaseOrder extends BaseEntity {
  orderNumber: string;
  storeId: string;
  supplierId: string;
  orderType: OrderType;
  sourceReorderIds?: string[];
  status: OrderStatus;
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
  createdByUserId?: string;
}

export interface PurchaseOrderItem extends BaseEntity {
  orderId: string;
  supplierProductId: string;
  productId: string;
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

export interface CreatePurchaseOrderItemInput {
  supplierProductId: string;
  productId: string;
  productName: string;
  supplierSku?: string;
  barcode?: string;
  quantityOrdered: number;
  unitPrice: number;
  mrp?: number;
  taxRate: number;
  discountPercent: number;
  lineTotal: number;
}

export interface CreatePurchaseOrderInput {
  storeId: string;
  supplierId: string;
  orderNumber: string;
  orderType: OrderType;
  sourceReorderIds?: string[];
  status?: OrderStatus;
  items: CreatePurchaseOrderItemInput[];
  storeNotes?: string;
  deliveryAddress?: string;
  expectedDeliveryDate?: string | Date;
  createdByUserId?: string;
}

// =============================================================================
// EVENT OUTBOX
// =============================================================================

export interface OutboxEvent {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

export async function writeToOutbox(
  client: PoolClient,
  event: OutboxEvent
): Promise<string> {
  const result = await client.query(
    `INSERT INTO orders.event_outbox (
      event_type, aggregate_type, aggregate_id, payload
    ) VALUES ($1, $2, $3, $4)
    RETURNING id`,
    [event.eventType, event.aggregateType, event.aggregateId, JSON.stringify(event.payload)]
  );
  return result.rows[0].id;
}

// =============================================================================
// PURCHASE ORDER QUERIES
// =============================================================================

export async function createPurchaseOrderWithClient(
  client: PoolClient,
  input: CreatePurchaseOrderInput
): Promise<PurchaseOrder> {
  if (input.items.length === 0) {
    throw new Error('At least one item is required');
  }

  const subtotal = input.items.reduce((sum, item) => sum + item.lineTotal, 0);
  const taxAmount = 0;
  const deliveryCharges = 0;
  const discountAmount = 0;
  const totalAmount = subtotal + taxAmount + deliveryCharges - discountAmount;
  const status = input.status ?? 'draft';

  const orderResult = await client.query<PurchaseOrder>(
    `INSERT INTO orders.purchase_orders (
      order_number,
      store_id,
      supplier_id,
      order_type,
      source_reorder_ids,
      status,
      subtotal,
      tax_amount,
      delivery_charges,
      discount_amount,
      total_amount,
      expected_delivery_date,
      actual_delivery_date,
      delivery_address,
      payment_status,
      store_notes,
      supplier_notes,
      created_by_user_id
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10,
      $11, $12, $13, $14,
      $15, $16, $17, $18
    )
    RETURNING
      id,
      order_number as "orderNumber",
      store_id as "storeId",
      supplier_id as "supplierId",
      order_type as "orderType",
      source_reorder_ids as "sourceReorderIds",
      status,
      subtotal,
      tax_amount as "taxAmount",
      delivery_charges as "deliveryCharges",
      discount_amount as "discountAmount",
      total_amount as "totalAmount",
      expected_delivery_date as "expectedDeliveryDate",
      actual_delivery_date as "actualDeliveryDate",
      delivery_address as "deliveryAddress",
      payment_status as "paymentStatus",
      store_notes as "storeNotes",
      supplier_notes as "supplierNotes",
      created_by_user_id as "createdByUserId",
      created_at as "createdAt",
      updated_at as "updatedAt"`,
    [
      input.orderNumber,
      input.storeId,
      input.supplierId,
      input.orderType,
      input.sourceReorderIds ?? null,
      status,
      subtotal,
      taxAmount,
      deliveryCharges,
      discountAmount,
      totalAmount,
      input.expectedDeliveryDate ?? null,
      null,
      input.deliveryAddress ?? null,
      'pending',
      input.storeNotes ?? null,
      null,
      input.createdByUserId ?? null,
    ]
  );

  const order = orderResult.rows[0];

  for (const item of input.items) {
    await client.query(
      `INSERT INTO orders.purchase_order_items (
        order_id,
        supplier_product_id,
        product_id,
        product_name,
        supplier_sku,
        barcode,
        ordered_quantity,
        received_quantity,
        unit_price,
        mrp,
        tax_rate,
        discount_percent,
        line_total,
        status
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14
      )`,
      [
        order.id,
        item.supplierProductId,
        item.productId,
        item.productName,
        item.supplierSku ?? null,
        item.barcode ?? null,
        item.quantityOrdered,
        0,
        item.unitPrice,
        item.mrp ?? null,
        item.taxRate,
        item.discountPercent,
        item.lineTotal,
        'pending',
      ]
    );
  }

  await writeToOutbox(client, {
    eventType: 'orders.po.created.v1',
    aggregateType: 'PurchaseOrder',
    aggregateId: order.id,
    payload: {
      orderId: order.id,
      storeId: order.storeId,
      supplierId: order.supplierId,
      orderNumber: order.orderNumber,
      status: order.status,
      orderType: order.orderType,
      totalAmount: order.totalAmount,
      itemCount: input.items.length,
      sourceReorderIds: input.sourceReorderIds ?? [],
    },
  });

  return order;
}

export async function createPurchaseOrderWithOutbox(
  input: CreatePurchaseOrderInput
): Promise<PurchaseOrder> {
  const client = await getClient();

  try {
    await client.query('BEGIN');
    const order = await createPurchaseOrderWithClient(client, input);
    await client.query('COMMIT');
    return order;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getPurchaseOrderById(
  orderId: string
): Promise<PurchaseOrder | null> {
  return queryOne<PurchaseOrder>(
    `SELECT
      id,
      order_number as "orderNumber",
      store_id as "storeId",
      supplier_id as "supplierId",
      order_type as "orderType",
      source_reorder_ids as "sourceReorderIds",
      status,
      subtotal,
      tax_amount as "taxAmount",
      delivery_charges as "deliveryCharges",
      discount_amount as "discountAmount",
      total_amount as "totalAmount",
      expected_delivery_date as "expectedDeliveryDate",
      actual_delivery_date as "actualDeliveryDate",
      delivery_address as "deliveryAddress",
      payment_status as "paymentStatus",
      store_notes as "storeNotes",
      supplier_notes as "supplierNotes",
      created_by_user_id as "createdByUserId",
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM orders.purchase_orders
    WHERE id = $1`,
    [orderId]
  );
}

export async function getPurchaseOrderByIdAndStore(
  orderId: string,
  storeId: string
): Promise<PurchaseOrder | null> {
  return queryOne<PurchaseOrder>(
    `SELECT
      id,
      order_number as "orderNumber",
      store_id as "storeId",
      supplier_id as "supplierId",
      order_type as "orderType",
      source_reorder_ids as "sourceReorderIds",
      status,
      subtotal,
      tax_amount as "taxAmount",
      delivery_charges as "deliveryCharges",
      discount_amount as "discountAmount",
      total_amount as "totalAmount",
      expected_delivery_date as "expectedDeliveryDate",
      actual_delivery_date as "actualDeliveryDate",
      delivery_address as "deliveryAddress",
      payment_status as "paymentStatus",
      store_notes as "storeNotes",
      supplier_notes as "supplierNotes",
      created_by_user_id as "createdByUserId",
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM orders.purchase_orders
    WHERE id = $1 AND store_id = $2`,
    [orderId, storeId]
  );
}

export async function getPurchaseOrderItems(
  orderId: string
): Promise<PurchaseOrderItem[]> {
  return query<PurchaseOrderItem>(
    `SELECT
      id,
      order_id as "orderId",
      supplier_product_id as "supplierProductId",
      product_id as "productId",
      product_name as "productName",
      supplier_sku as "supplierSku",
      barcode,
      ordered_quantity as "orderedQuantity",
      received_quantity as "receivedQuantity",
      unit_price as "unitPrice",
      mrp,
      tax_rate as "taxRate",
      discount_percent as "discountPercent",
      line_total as "lineTotal",
      status,
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM orders.purchase_order_items
    WHERE order_id = $1
    ORDER BY created_at ASC`,
    [orderId]
  );
}

// =============================================================================
// LIST QUERIES WITH FILTERS
// =============================================================================

export interface ListPurchaseOrdersFilters {
  storeId: string;
  statuses?: OrderStatus[];
  supplierId?: string;
  fromDate?: string;
  toDate?: string;
  page: number;
  limit: number;
}

export interface PurchaseOrderListItem extends PurchaseOrder {
  supplierName?: string;
  itemCount: number;
}

export interface ListPurchaseOrdersResult {
  items: PurchaseOrderListItem[];
  total: number;
  page: number;
  limit: number;
}

/**
 * List purchase orders with multi-status filter support.
 * V3.0.9: Added support for comma-separated status values.
 */
export async function listPurchaseOrders(
  filters: ListPurchaseOrdersFilters
): Promise<ListPurchaseOrdersResult> {
  const params: unknown[] = [filters.storeId];
  let paramIndex = 2;

  let whereClause = 'WHERE po.store_id = $1';

  if (filters.statuses && filters.statuses.length > 0) {
    const statusPlaceholders = filters.statuses
      .map(() => `$${paramIndex++}`)
      .join(', ');
    whereClause += ` AND po.status IN (${statusPlaceholders})`;
    params.push(...filters.statuses);
  }

  if (filters.supplierId) {
    whereClause += ` AND po.supplier_id = $${paramIndex++}`;
    params.push(filters.supplierId);
  }

  if (filters.fromDate) {
    whereClause += ` AND po.created_at >= $${paramIndex++}`;
    params.push(filters.fromDate);
  }
  if (filters.toDate) {
    whereClause += ` AND po.created_at <= $${paramIndex++}`;
    params.push(filters.toDate);
  }

  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM orders.purchase_orders po
     ${whereClause}`,
    params
  );
  const total = parseInt(countResult?.count ?? '0', 10);

  const offset = (filters.page - 1) * filters.limit;
  const itemsParams = [...params, filters.limit, offset];
  const limitIndex = paramIndex++;
  const offsetIndex = paramIndex++;

  const items = await query<PurchaseOrderListItem>(
    `SELECT
      po.id,
      po.order_number as "orderNumber",
      po.store_id as "storeId",
      po.supplier_id as "supplierId",
      po.order_type as "orderType",
      po.source_reorder_ids as "sourceReorderIds",
      po.status,
      po.subtotal,
      po.tax_amount as "taxAmount",
      po.delivery_charges as "deliveryCharges",
      po.discount_amount as "discountAmount",
      po.total_amount as "totalAmount",
      po.expected_delivery_date as "expectedDeliveryDate",
      po.actual_delivery_date as "actualDeliveryDate",
      po.delivery_address as "deliveryAddress",
      po.payment_status as "paymentStatus",
      po.store_notes as "storeNotes",
      po.supplier_notes as "supplierNotes",
      po.created_by_user_id as "createdByUserId",
      po.created_at as "createdAt",
      po.updated_at as "updatedAt",
      s.business_name as "supplierName",
      COALESCE(oi.item_count, 0) as "itemCount"
    FROM orders.purchase_orders po
    LEFT JOIN supplier.suppliers s ON s.id = po.supplier_id
    LEFT JOIN (
      SELECT order_id, COUNT(*)::int as item_count
      FROM orders.purchase_order_items
      GROUP BY order_id
    ) oi ON oi.order_id = po.id
    ${whereClause}
    ORDER BY po.created_at DESC
    LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    itemsParams
  );

  return {
    items,
    total,
    page: filters.page,
    limit: filters.limit,
  };
}

// =============================================================================
// ORDER EVENTS (Status Transition Log)
// =============================================================================

export type ActorType = 'user' | 'system' | 'service' | 'store' | 'supplier' | 'platform';

export interface OrderEvent extends BaseEntity {
  orderId: string;
  eventType: string;
  fromStatus?: OrderStatus;
  toStatus?: OrderStatus;
  actorId?: string;
  actorType: ActorType;
  metadata?: Record<string, unknown>;
}

export interface CreateOrderEventInput {
  orderId: string;
  eventType: string;
  fromStatus?: OrderStatus;
  toStatus?: OrderStatus;
  actorId?: string;
  actorType: ActorType;
  metadata?: Record<string, unknown>;
}

/**
 * Log an order event (status transition, action, etc.)
 */
export async function createOrderEvent(
  client: PoolClient,
  input: CreateOrderEventInput
): Promise<OrderEvent> {
  const result = await client.query<OrderEvent>(
    `INSERT INTO orders.order_events (
      order_id, event_type, from_status, to_status,
      actor_id, actor_type, details
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING
      id,
      order_id as "orderId",
      event_type as "eventType",
      from_status as "fromStatus",
      to_status as "toStatus",
      actor_id as "actorId",
      actor_type as "actorType",
      details as "metadata",
      created_at as "createdAt"`,
    [
      input.orderId,
      input.eventType,
      input.fromStatus ?? null,
      input.toStatus ?? null,
      input.actorId ?? null,
      input.actorType,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ]
  );

  return result.rows[0];
}

/**
 * Get order events/history.
 */
export async function getOrderEvents(
  orderId: string
): Promise<OrderEvent[]> {
  return query<OrderEvent>(
    `SELECT
      id,
      order_id as "orderId",
      event_type as "eventType",
      from_status as "fromStatus",
      to_status as "toStatus",
      actor_id as "actorId",
      actor_type as "actorType",
      details as "metadata",
      created_at as "createdAt"
    FROM orders.order_events
    WHERE order_id = $1
    ORDER BY created_at ASC`,
    [orderId]
  );
}

// =============================================================================
// ORDER STATUS UPDATE
// =============================================================================

/**
 * Update order status (called within a transaction).
 */
export async function updateOrderStatus(
  client: PoolClient,
  orderId: string,
  newStatus: OrderStatus,
  timestampField?: string
): Promise<PurchaseOrder> {
  let query = `
    UPDATE orders.purchase_orders
    SET status = $2,
        updated_at = NOW()`;

  // Set timestamp field if provided (e.g., submitted_at, cancelled_at)
  if (timestampField) {
    query += `,
        ${timestampField} = NOW()`;
  }

  query += `
    WHERE id = $1
    RETURNING
      id,
      order_number as "orderNumber",
      store_id as "storeId",
      supplier_id as "supplierId",
      order_type as "orderType",
      source_reorder_ids as "sourceReorderIds",
      status,
      subtotal,
      tax_amount as "taxAmount",
      delivery_charges as "deliveryCharges",
      discount_amount as "discountAmount",
      total_amount as "totalAmount",
      expected_delivery_date as "expectedDeliveryDate",
      actual_delivery_date as "actualDeliveryDate",
      delivery_address as "deliveryAddress",
      payment_status as "paymentStatus",
      store_notes as "storeNotes",
      supplier_notes as "supplierNotes",
      created_by_user_id as "createdByUserId",
      created_at as "createdAt",
      updated_at as "updatedAt"`;

  const result = await client.query<PurchaseOrder>(query, [orderId, newStatus]);
  return result.rows[0];
}

// =============================================================================
// GRN (Goods Received Note) TYPES & QUERIES
// =============================================================================

export interface ReceiveRecord extends BaseEntity {
  orderId: string;
  receiveNumber: string;
  receivedByUserId?: string;
  notes?: string;
  totalItemsReceived: number;
}

export interface ReceiveRecordItem extends BaseEntity {
  receiveRecordId: string;
  orderItemId: string;
  quantityReceived: number;
  notes?: string;
}

export interface CreateReceiveRecordInput {
  orderId: string;
  receiveNumber: string;
  receivedByUserId?: string;
  notes?: string;
  items: Array<{
    orderItemId: string;
    quantityReceived: number;
    notes?: string;
  }>;
}

/**
 * Generate next receive number for an order.
 * Format: {orderNumber}-R{N} (e.g., PO-MUM01-26-000001-R1)
 */
export async function getNextReceiveNumber(
  client: PoolClient,
  orderId: string,
  orderNumber: string
): Promise<string> {
  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text as count
     FROM orders.receive_records
     WHERE order_id = $1`,
    [orderId]
  );
  const count = parseInt(result.rows[0].count, 10) + 1;
  return `${orderNumber}-R${count}`;
}

/**
 * Create a receive record with items.
 */
export async function createReceiveRecord(
  client: PoolClient,
  input: CreateReceiveRecordInput
): Promise<ReceiveRecord> {
  const totalItemsReceived = input.items.reduce(
    (sum, item) => sum + item.quantityReceived,
    0
  );

  const recordResult = await client.query<ReceiveRecord>(
    `INSERT INTO orders.receive_records (
      order_id, receive_number, received_by_user_id, notes, total_items_received
    ) VALUES ($1, $2, $3, $4, $5)
    RETURNING
      id,
      order_id as "orderId",
      receive_number as "receiveNumber",
      received_by_user_id as "receivedByUserId",
      notes,
      total_items_received as "totalItemsReceived",
      created_at as "createdAt",
      updated_at as "updatedAt"`,
    [
      input.orderId,
      input.receiveNumber,
      input.receivedByUserId ?? null,
      input.notes ?? null,
      totalItemsReceived,
    ]
  );

  const record = recordResult.rows[0];

  // Insert receive record items
  for (const item of input.items) {
    await client.query(
      `INSERT INTO orders.receive_record_items (
        receive_record_id, order_item_id, quantity_received, notes
      ) VALUES ($1, $2, $3, $4)`,
      [record.id, item.orderItemId, item.quantityReceived, item.notes ?? null]
    );
  }

  return record;
}

/**
 * Get receive records for an order.
 */
export async function getReceiveRecords(
  orderId: string
): Promise<ReceiveRecord[]> {
  return query<ReceiveRecord>(
    `SELECT
      id,
      order_id as "orderId",
      receive_number as "receiveNumber",
      received_by_user_id as "receivedByUserId",
      notes,
      total_items_received as "totalItemsReceived",
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM orders.receive_records
    WHERE order_id = $1
    ORDER BY created_at ASC`,
    [orderId]
  );
}

/**
 * Get receive record items.
 */
export async function getReceiveRecordItems(
  receiveRecordId: string
): Promise<ReceiveRecordItem[]> {
  return query<ReceiveRecordItem>(
    `SELECT
      id,
      receive_record_id as "receiveRecordId",
      order_item_id as "orderItemId",
      quantity_received as "quantityReceived",
      notes,
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM orders.receive_record_items
    WHERE receive_record_id = $1`,
    [receiveRecordId]
  );
}

/**
 * Update order item received quantity (cumulative).
 */
export async function updateOrderItemReceivedQuantity(
  client: PoolClient,
  orderItemId: string,
  additionalQuantity: number
): Promise<PurchaseOrderItem> {
  const result = await client.query<PurchaseOrderItem>(
    `UPDATE orders.purchase_order_items
     SET received_quantity = received_quantity + $2,
         status = CASE
           WHEN received_quantity + $2 >= ordered_quantity THEN 'received'
           WHEN received_quantity + $2 > 0 THEN 'partial'
           ELSE status
         END,
         updated_at = NOW()
     WHERE id = $1
     RETURNING
       id,
       order_id as "orderId",
       supplier_product_id as "supplierProductId",
       product_id as "productId",
       product_name as "productName",
       supplier_sku as "supplierSku",
       barcode,
       ordered_quantity as "orderedQuantity",
       received_quantity as "receivedQuantity",
       unit_price as "unitPrice",
       mrp,
       tax_rate as "taxRate",
       discount_percent as "discountPercent",
       line_total as "lineTotal",
       status,
       created_at as "createdAt",
       updated_at as "updatedAt"`,
    [orderItemId, additionalQuantity]
  );
  return result.rows[0];
}

/**
 * Check if all items in an order are fully received.
 */
export async function checkOrderFullyReceived(
  client: PoolClient,
  orderId: string
): Promise<{ fullyReceived: boolean; partiallyReceived: boolean }> {
  const result = await client.query<{
    total: string;
    fullyReceived: string;
    partiallyReceived: string;
  }>(
    `SELECT
      COUNT(*)::text as total,
      COUNT(*) FILTER (WHERE received_quantity >= ordered_quantity)::text as "fullyReceived",
      COUNT(*) FILTER (WHERE received_quantity > 0 AND received_quantity < ordered_quantity)::text as "partiallyReceived"
    FROM orders.purchase_order_items
    WHERE order_id = $1`,
    [orderId]
  );

  const row = result.rows[0];
  const total = parseInt(row.total, 10);
  const fullyReceived = parseInt(row.fullyReceived, 10);

  return {
    fullyReceived: total > 0 && fullyReceived === total,
    partiallyReceived: fullyReceived > 0 && fullyReceived < total,
  };
}
