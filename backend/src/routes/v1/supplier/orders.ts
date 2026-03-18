// SM-005: Supplier Orders Routes
// SEC-001: Status gating for write operations
// T-245: Added reorder context + delivery confirmation
// View and manage orders from retailers

import { Router, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getPool } from "../../../db/client";
import { requireSupplierAuth, SupplierAuthRequest } from "./auth";
import { requireActiveSupplier, requireRegisteredSupplier } from "../../../middleware/supplierStatusGate";
import { log } from "../../../lib/logger";
// V3-FIX-143: Staged supplier disclosure
import { SUPPLIER_VISIBILITY_RULES } from "../../../services/procurementLane";

// SUP-POS-012: JWT config for SSE token verification (EventSource can't set headers)
// SEC-003: Only allow dev fallback when NODE_ENV is explicitly 'development' or 'test'
const SSE_JWT_SECRET = (() => {
  const secret = process.env['JWT_SECRET']?.trim();
  if (!secret) {
    // W5-BACKEND-JWT-001: JWT_SECRET must always be set; no hardcoded fallback in any environment
    log.error('[FATAL] JWT_SECRET must be set (NODE_ENV is not development/test)');
    process.exit(1);
  }
  return secret;
})();
const SSE_JWT_ISSUER = process.env['JWT_ISSUER'] || 'supermandi-auth';

const router = Router();

// R6.CROSS.004: Write to outbox so downstream consumers (reorder-service, analytics) see supplier-initiated changes
async function writeSupplierOutboxEvent(
  pool: ReturnType<typeof getPool>,
  eventType: string,
  orderId: string,
  payload: Record<string, unknown>
): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO orders.event_outbox (event_type, aggregate_type, aggregate_id, payload)
     VALUES ($1, 'PurchaseOrder', $2, $3)`,
    [eventType, orderId, JSON.stringify(payload)]
  );
}

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/v1/supplier/orders
 * List all orders for the authenticated supplier
 * GL-WF-063: Supports pagination via page and limit query params
 * SEC-001: Allow registered suppliers to view orders
 */
router.get("/orders", requireSupplierAuth, requireRegisteredSupplier, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    // GL-WF-063: Parse pagination parameters
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    // STG-776: Server-side status filter (whitelist valid statuses)
    const validStatuses = ['submitted', 'confirmed', 'shipped', 'partial_received', 'delivered', 'cancelled'];
    const statusParam = req.query.status as string | undefined;
    const statusFilter = statusParam && validStatuses.includes(statusParam) ? statusParam : null;

    // GL-WF-063: Get total count of unique orders for this supplier
    // FIX: Use correct column names (order_id instead of purchase_order_id)
    const countResult = await pool.query(
      `SELECT COUNT(DISTINCT po.id) as total
       FROM orders.purchase_orders po
       JOIN orders.purchase_order_items poi ON poi.order_id = po.id
       JOIN catalog.supplier_products sp ON sp.id = poi.supplier_product_id
       WHERE sp.supplier_id = $1
         AND po.status != 'draft'${statusFilter ? ' AND po.status = $2' : ''}`,
      statusFilter ? [req.supplierId, statusFilter] : [req.supplierId]
    );
    const total = parseInt(countResult.rows[0]?.total || '0');

    // GO-LIVE-028: Get status counts for accurate dashboard display
    // CL-010: Exclude draft orders from supplier visibility
    const statusCountsResult = await pool.query(
      `SELECT po.status, COUNT(DISTINCT po.id) as count
       FROM orders.purchase_orders po
       JOIN orders.purchase_order_items poi ON poi.order_id = po.id
       JOIN catalog.supplier_products sp ON sp.id = poi.supplier_product_id
       WHERE sp.supplier_id = $1
         AND po.status != 'draft'
       GROUP BY po.status`,
      [req.supplierId]
    );
    const statusCounts: Record<string, number> = { all: total };
    for (const row of statusCountsResult.rows) {
      statusCounts[row.status] = parseInt(row.count);
    }

    // Get orders where any item is from this supplier
    // GL-WF-063: Add LIMIT and OFFSET for pagination
    // GL-WF-038: Include item-level status for per-item tracking
    // FIX: Use correct column names from actual schema
    // T-245: Include order_type for reorder badge display
    const result = await pool.query(
      `SELECT
        po.id,
        po.store_id,
        s.name as store_name,
        po.status,
        po.order_type,
        po.total_amount as total_amount,
        po.created_at,
        po.updated_at,
        json_agg(
          json_build_object(
            'id', poi.id,
            'productId', poi.supplier_product_id,
            'productName', sp.name,
            'quantity', poi.ordered_quantity,
            'receivedQuantity', poi.received_quantity,
            'unitPrice', poi.unit_price,
            'total', poi.line_total,
            'status', poi.status
          )
        ) FILTER (WHERE sp.supplier_id = $1) as items
      FROM orders.purchase_orders po
      JOIN platform.stores s ON s.id = po.store_id
      JOIN orders.purchase_order_items poi ON poi.order_id = po.id
      JOIN catalog.supplier_products sp ON sp.id = poi.supplier_product_id
      WHERE sp.supplier_id = $1
        AND po.status != 'draft'${statusFilter ? ' AND po.status = $4' : ''}
      GROUP BY po.id, po.store_id, s.name, po.status, po.order_type, po.total_amount, po.created_at, po.updated_at
      ORDER BY po.created_at DESC
      LIMIT $2 OFFSET $3`,
      statusFilter ? [req.supplierId, limit, offset, statusFilter] : [req.supplierId, limit, offset]
    );

    // V3-FIX-143: Staged disclosure — list view uses pre-acceptance rules
    const listVisibility = SUPPLIER_VISIBILITY_RULES.pre_acceptance;
    res.json({
      data: result.rows.map((o) => ({
        id: o.id,
        // V3-FIX-143: Hide store identity in list (pre-acceptance)
        storeId: undefined,
        storeName: listVisibility.retailerName ? o.store_name : undefined,
        status: o.status,
        orderType: o.order_type || 'manual',
        totalAmount: o.total_amount,
        items: o.items || [],
        createdAt: o.created_at,
        updatedAt: o.updated_at,
      })),
      // GL-WF-063: Pagination metadata
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      // GO-LIVE-028: Status counts for accurate dashboard display
      statusCounts,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/supplier/orders/mark-read
 * SUP-POS-007: Mark orders as read (updates last_viewed_at for badge clearing)
 */
router.post("/orders/mark-read", requireSupplierAuth, requireRegisteredSupplier, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    // Create table if not exists (idempotent)
    await pool.query(
      `CREATE TABLE IF NOT EXISTS supplier.supplier_order_views (
        supplier_id UUID PRIMARY KEY,
        last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    );

    // Upsert last_viewed_at
    await pool.query(
      `INSERT INTO supplier.supplier_order_views (supplier_id, last_viewed_at)
       VALUES ($1, NOW())
       ON CONFLICT (supplier_id)
       DO UPDATE SET last_viewed_at = NOW()`,
      [req.supplierId]
    );

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/supplier/orders/stream
 * SUP-POS-012: SSE endpoint for real-time order updates
 * Polls order_events table and pushes new events to connected supplier
 * Auth via ?token= query param (EventSource can't set Authorization headers)
 * IMPORTANT: Must be defined BEFORE /orders/:id to avoid Express param matching
 */
router.get("/orders/stream", async (req: Request, res: Response) => {
  // STBT-176: Prefer HttpOnly cookie over query param (JWT in URL visible in logs/history)
  // sm_access_token cookie has path=/api, so EventSource sends it automatically for same-origin
  const cookieHeader = req.headers.cookie || '';
  const cookieMatch = cookieHeader.match(/(?:^|;\s*)sm_access_token=([^;]*)/);
  const token = (cookieMatch?.[1] ? decodeURIComponent(cookieMatch[1]) : null)
    || (req.query.token as string | undefined); // Fallback for backward compat
  if (!token) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Token required' } });
    return;
  }

  let supplierId: string;
  try {
    const decoded = jwt.verify(token, SSE_JWT_SECRET, { issuer: SSE_JWT_ISSUER }) as {
      actorType: string;
      actorId: string;
    };
    if (decoded.actorType !== 'SUPPLIER') {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Invalid token type' } });
      return;
    }
    supplierId = decoded.actorId;
  } catch {
    res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' } });
    return;
  }

  const pool = getPool();
  if (!pool) {
    res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
    return;
  }

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write(`event: connected\ndata: ${JSON.stringify({ supplierId })}\n\n`);

  let lastEventTime = new Date();
  let closed = false;

  // Initialize: get latest event timestamp for this supplier
  try {
    const latest = await pool.query(
      `SELECT MAX(oe.created_at) as latest
       FROM orders.order_events oe
       JOIN orders.purchase_orders po ON po.id = oe.purchase_order_id
       JOIN orders.purchase_order_items poi ON poi.order_id = po.id
       JOIN catalog.supplier_products sp ON sp.id = poi.supplier_product_id
       WHERE sp.supplier_id = $1`,
      [supplierId]
    );
    if (latest.rows[0]?.latest) {
      lastEventTime = new Date(latest.rows[0].latest);
    }
  } catch {
    // Start from now
  }

  // Poll for new events every 5 seconds
  const pollInterval = setInterval(async () => {
    if (closed) return;

    try {
      const result = await pool.query(
        `SELECT oe.id, oe.event_type, oe.actor_type, oe.metadata, oe.created_at,
                po.id as order_id, po.status as order_status, po.order_number
         FROM orders.order_events oe
         JOIN orders.purchase_orders po ON po.id = oe.purchase_order_id
         JOIN orders.purchase_order_items poi ON poi.order_id = po.id
         JOIN catalog.supplier_products sp ON sp.id = poi.supplier_product_id
         WHERE sp.supplier_id = $1
           AND oe.created_at > $2
         GROUP BY oe.id, oe.event_type, oe.actor_type, oe.metadata, oe.created_at,
                  po.id, po.status, po.order_number
         ORDER BY oe.created_at ASC
         LIMIT 50`,
        [supplierId, lastEventTime.toISOString()]
      );

      for (const row of result.rows) {
        if (closed) break;

        // T-247: Enhanced event type mapping including delivery + reorder events
        const eventType = row.event_type.includes('status_changed') ? 'order.status_changed'
          : row.event_type === 'order_created' ? 'order.created'
          : row.event_type === 'delivery_confirmed' ? 'order.delivery_confirmed'
          : row.event_type.includes('payment') ? 'order.payment_received'
          : 'order.event';

        const data = {
          eventId: row.id,
          type: eventType,
          orderId: row.order_id,
          orderNumber: row.order_number,
          orderStatus: row.order_status,
          metadata: row.metadata,
          timestamp: row.created_at,
        };

        res.write(`id: ${row.id}\nevent: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
        lastEventTime = new Date(row.created_at);
      }
    } catch {
      // Silently continue on poll errors
    }
  }, 5000);

  // Send keepalive every 30 seconds
  const keepaliveInterval = setInterval(() => {
    if (closed) return;
    try {
      res.write(`:keepalive\n\n`);
    } catch {
      // Connection closed
    }
  }, 30000);

  // Clean up on disconnect
  req.on('close', () => {
    closed = true;
    clearInterval(pollInterval);
    clearInterval(keepaliveInterval);
  });
});

/**
 * GET /api/v1/supplier/orders/:id
 * SUP-POS-008: Get single order detail with full info (barcode, SKU, store contact, timeline)
 */
router.get("/orders/:id", requireSupplierAuth, requireRegisteredSupplier, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    // T-245: Get order with store contact info + reorder context + payment terms
    const orderResult = await pool.query(
      `SELECT
        po.id,
        po.order_number,
        po.store_id,
        s.name as store_name,
        s.city as store_city,
        s.phone as store_phone,
        po.status,
        po.order_type,
        po.source_reorder_ids,
        po.total_amount,
        po.tracking_number,
        po.carrier,
        po.shipped_at,
        po.shipment_date,
        po.expected_delivery_date,
        po.actual_delivery_date,
        po.store_notes,
        po.created_at,
        po.updated_at,
        ssl.payment_terms,
        json_agg(
          json_build_object(
            'id', poi.id,
            'productId', poi.supplier_product_id,
            'productName', COALESCE(sp.edited_name, sp.name),
            'barcode', sp.barcode,
            'supplierSku', sp.supplier_sku,
            'unit', COALESCE(sp.unit, 'PCS'),
            'orderedQuantity', poi.ordered_quantity,
            'receivedQuantity', poi.received_quantity,
            'unitPrice', poi.unit_price,
            'lineTotal', poi.line_total,
            'status', poi.status
          )
        ) FILTER (WHERE sp.supplier_id = $2) as items
      FROM orders.purchase_orders po
      JOIN platform.stores s ON s.id = po.store_id
      JOIN orders.purchase_order_items poi ON poi.order_id = po.id
      JOIN catalog.supplier_products sp ON sp.id = poi.supplier_product_id
      LEFT JOIN supplier.supplier_store_links ssl
        ON ssl.supplier_id = $2 AND ssl.store_id = po.store_id
      WHERE po.id = $1 AND sp.supplier_id = $2
      GROUP BY po.id, po.order_number, po.store_id, s.name, s.city, s.phone,
               po.status, po.order_type, po.source_reorder_ids, po.total_amount,
               po.tracking_number, po.carrier, po.shipped_at, po.shipment_date,
               po.expected_delivery_date, po.actual_delivery_date,
               po.store_notes, po.created_at, po.updated_at, ssl.payment_terms`,
      [id, req.supplierId]
    );

    if (orderResult.rows.length === 0) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Order not found' }
      });
      return;
    }

    const o = orderResult.rows[0];

    // V3-FIX-143: Staged disclosure — detail uses acceptance-phase-based rules
    const isAccepted = ["confirmed", "shipped", "delivered", "partial_received"].includes(o.status);
    const vis = isAccepted ? SUPPLIER_VISIBILITY_RULES.post_acceptance : SUPPLIER_VISIBILITY_RULES.pre_acceptance;

    res.json({
      data: {
        id: o.id,
        orderNumber: o.order_number,
        // V3-FIX-143: Store identity gated by acceptance phase
        storeId: undefined,
        storeName: vis.retailerName ? o.store_name : undefined,
        storeCity: vis.deliveryCity ? o.store_city : undefined,
        storePhone: vis.retailerPhone ? o.store_phone : undefined,
        deliveryFullAddress: vis.deliveryFullAddress ? (o.delivery_address ?? o.store_city) : undefined,
        status: o.status,
        orderType: o.order_type || 'manual',
        isReorder: o.order_type === 'reorder',
        sourceReorderIds: o.source_reorder_ids || [],
        totalAmount: o.total_amount,
        trackingNumber: o.tracking_number,
        carrier: o.carrier,
        shippedAt: o.shipped_at,
        shipmentDate: o.shipment_date,
        expectedDeliveryDate: o.expected_delivery_date,
        actualDeliveryDate: o.actual_delivery_date,
        // V3-FIX-143: Payment terms visible post-acceptance only
        paymentTerms: isAccepted ? (o.payment_terms || null) : undefined,
        storeNotes: isAccepted ? o.store_notes : undefined,
        items: o.items || [],
        createdAt: o.created_at,
        updatedAt: o.updated_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/supplier/orders/:id/events
 * SUP-POS-008: Get order timeline (status history)
 */
router.get("/orders/:id/events", requireSupplierAuth, requireRegisteredSupplier, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    // Verify supplier owns items in this order
    const checkResult = await pool.query(
      `SELECT DISTINCT po.id
       FROM orders.purchase_orders po
       JOIN orders.purchase_order_items poi ON poi.order_id = po.id
       JOIN catalog.supplier_products sp ON sp.id = poi.supplier_product_id
       WHERE po.id = $1 AND sp.supplier_id = $2`,
      [id, req.supplierId]
    );

    if (checkResult.rows.length === 0) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Order not found' }
      });
      return;
    }

    const result = await pool.query(
      `SELECT id, event_type, actor_type, metadata, created_at
       FROM orders.order_events
       WHERE purchase_order_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    res.json({
      data: result.rows.map(e => ({
        id: e.id,
        eventType: e.event_type,
        actorType: e.actor_type,
        metadata: e.metadata,
        createdAt: e.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/v1/supplier/orders/:id/status
 * Update order status
 * SEC-001: Requires ACTIVE supplier status
 */
router.patch("/orders/:id/status", requireSupplierAuth, requireActiveSupplier, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // STG-079: Added partial_received to align with frontend status flow
    const validStatuses = ['submitted', 'confirmed', 'shipped', 'delivered', 'partial_received', 'cancelled'];
    if (!status || !validStatuses.includes(status)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: `Status must be one of: ${validStatuses.join(', ')}` }
      });
      return;
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    // Verify this order contains items from this supplier
    const checkResult = await pool.query(
      `SELECT DISTINCT po.id, po.status
       FROM orders.purchase_orders po
       JOIN orders.purchase_order_items poi ON poi.order_id = po.id
       JOIN catalog.supplier_products sp ON sp.id = poi.supplier_product_id
       WHERE po.id = $1 AND sp.supplier_id = $2`,
      [id, req.supplierId]
    );

    if (checkResult.rows.length === 0) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Order not found' }
      });
      return;
    }

    const currentStatus = checkResult.rows[0].status;

    // R6.CROSS.003+004: Aligned with order-service stateMachine.ts (source of truth)
    const validTransitions: Record<string, string[]> = {
      draft: ['submitted', 'cancelled'],
      submitted: ['confirmed', 'cancelled'],
      confirmed: ['shipped', 'cancelled'],
      shipped: ['delivered', 'partial_received'],
      partial_received: ['delivered', 'partial_received'],
      delivered: [],
      cancelled: [],
    };

    if (!validTransitions[currentStatus]?.includes(status)) {
      res.status(400).json({
        error: { code: 'INVALID_TRANSITION', message: `Cannot transition from ${currentStatus} to ${status}` }
      });
      return;
    }

    // Update status
    const result = await pool.query(
      `UPDATE orders.purchase_orders
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, status, updated_at`,
      [status, id]
    );

    // Log the status change
    await pool.query(
      `INSERT INTO orders.order_events (purchase_order_id, event_type, actor_id, actor_type, metadata)
       VALUES ($1, $2, $3, 'supplier', $4)`,
      [
        id,
        `status_changed_to_${status}`,
        req.supplierId,
        JSON.stringify({ from: currentStatus, to: status }),
      ]
    );

    // R6.CROSS.004: Write to outbox for downstream consumers
    await writeSupplierOutboxEvent(pool, 'orders.po.status_changed.v1', id, {
      orderId: id,
      previousStatus: currentStatus,
      newStatus: status,
      actor: { type: 'supplier', id: req.supplierId },
      changedAt: new Date().toISOString(),
    });

    res.json({
      data: {
        id: result.rows[0].id,
        status: result.rows[0].status,
        updatedAt: result.rows[0].updated_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/v1/supplier/orders/:id/shipment
 * GL-WF-039: Add shipment tracking information
 * GO-LIVE-029: Added shipment date and expected delivery date fields
 * SEC-001: Requires ACTIVE supplier status
 */
router.patch("/orders/:id/shipment", requireSupplierAuth, requireActiveSupplier, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { trackingNumber, carrier, shipmentDate, expectedDeliveryDate } = req.body;

    if (!trackingNumber || !carrier) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Tracking number and carrier are required' }
      });
      return;
    }

    // GO-LIVE-029: Validate date formats if provided
    let parsedShipmentDate: Date | null = null;
    let parsedExpectedDeliveryDate: Date | null = null;

    if (shipmentDate) {
      parsedShipmentDate = new Date(shipmentDate);
      if (isNaN(parsedShipmentDate.getTime())) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid shipment date format' }
        });
        return;
      }
    }

    if (expectedDeliveryDate) {
      parsedExpectedDeliveryDate = new Date(expectedDeliveryDate);
      if (isNaN(parsedExpectedDeliveryDate.getTime())) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid expected delivery date format' }
        });
        return;
      }
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    // Verify this order contains items from this supplier and is in confirmed/shipped status
    const checkResult = await pool.query(
      `SELECT DISTINCT po.id, po.status
       FROM orders.purchase_orders po
       JOIN orders.purchase_order_items poi ON poi.order_id = po.id
       JOIN catalog.supplier_products sp ON sp.id = poi.supplier_product_id
       WHERE po.id = $1 AND sp.supplier_id = $2`,
      [id, req.supplierId]
    );

    if (checkResult.rows.length === 0) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Order not found' }
      });
      return;
    }

    const currentStatus = checkResult.rows[0].status;
    if (!['confirmed', 'shipped'].includes(currentStatus)) {
      res.status(400).json({
        error: { code: 'INVALID_STATUS', message: 'Shipment info can only be added to confirmed or shipped orders' }
      });
      return;
    }

    // Update order with tracking info and set status to shipped if confirmed
    // GO-LIVE-029: Include shipment_date and expected_delivery_date
    const newStatus = currentStatus === 'confirmed' ? 'shipped' : currentStatus;
    const result = await pool.query(
      `UPDATE orders.purchase_orders
       SET tracking_number = $1, carrier = $2, status = $3,
           shipped_at = COALESCE(shipped_at, NOW()),
           shipment_date = COALESCE($5, shipment_date),
           expected_delivery_date = COALESCE($6, expected_delivery_date),
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, status, tracking_number, carrier, shipped_at, shipment_date, expected_delivery_date, updated_at`,
      [trackingNumber, carrier, newStatus, id, parsedShipmentDate, parsedExpectedDeliveryDate]
    );

    // Log the shipment event
    await pool.query(
      `INSERT INTO orders.order_events (purchase_order_id, event_type, actor_id, actor_type, metadata)
       VALUES ($1, 'shipment_added', $2, 'supplier', $3)`,
      [
        id,
        req.supplierId,
        JSON.stringify({ trackingNumber, carrier, shipmentDate, expectedDeliveryDate, previousStatus: currentStatus }),
      ]
    );

    // R6.CROSS.004: Write to outbox for downstream consumers
    if (newStatus !== currentStatus) {
      await writeSupplierOutboxEvent(pool, 'orders.po.status_changed.v1', id, {
        orderId: id,
        previousStatus: currentStatus,
        newStatus,
        actor: { type: 'supplier', id: req.supplierId },
        trackingNumber,
        carrier,
        changedAt: new Date().toISOString(),
      });
    }

    res.json({
      data: {
        id: result.rows[0].id,
        status: result.rows[0].status,
        trackingNumber: result.rows[0].tracking_number,
        carrier: result.rows[0].carrier,
        shippedAt: result.rows[0].shipped_at,
        shipmentDate: result.rows[0].shipment_date,
        expectedDeliveryDate: result.rows[0].expected_delivery_date,
        updatedAt: result.rows[0].updated_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/supplier/orders/:id/delivery-confirm
 * T-245: Supplier records delivery metadata (notes, proof URL).
 * R6.CROSS.007: Does NOT change status — only GRN (retailer receive) triggers
 * the shipped→delivered transition with proper inventory updates.
 * SEC-001: Requires ACTIVE supplier status
 */
router.post("/orders/:id/delivery-confirm", requireSupplierAuth, requireActiveSupplier, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { deliveryNotes, deliveryProofUrl } = req.body;

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    // Verify this order contains items from this supplier
    const checkResult = await pool.query(
      `SELECT DISTINCT po.id, po.status, po.order_type
       FROM orders.purchase_orders po
       JOIN orders.purchase_order_items poi ON poi.order_id = po.id
       JOIN catalog.supplier_products sp ON sp.id = poi.supplier_product_id
       WHERE po.id = $1 AND sp.supplier_id = $2`,
      [id, req.supplierId]
    );

    if (checkResult.rows.length === 0) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Order not found' }
      });
      return;
    }

    const currentStatus = checkResult.rows[0].status;
    if (currentStatus !== 'shipped') {
      res.status(400).json({
        error: { code: 'INVALID_TRANSITION', message: `Only shipped orders can record delivery confirmation (current: ${currentStatus})` }
      });
      return;
    }

    // R6.CROSS.007: Record delivery metadata WITHOUT changing status.
    // Status remains 'shipped' — retailer GRN flow handles shipped→delivered with inventory updates.
    const result = await pool.query(
      `UPDATE orders.purchase_orders
       SET updated_at = NOW()
       WHERE id = $1
       RETURNING id, status, updated_at`,
      [id]
    );

    // Log delivery confirmation event with metadata
    await pool.query(
      `INSERT INTO orders.order_events (purchase_order_id, event_type, actor_id, actor_type, metadata)
       VALUES ($1, 'supplier_delivery_confirmed', $2, 'supplier', $3)`,
      [
        id,
        req.supplierId,
        JSON.stringify({
          status: currentStatus,
          deliveryNotes: deliveryNotes || null,
          deliveryProofUrl: deliveryProofUrl || null,
          isReorder: checkResult.rows[0].order_type === 'reorder',
          note: 'Supplier confirmed delivery. Awaiting retailer GRN for status transition.',
        }),
      ]
    );

    // R6.CROSS.004: Write to outbox for downstream consumers
    await writeSupplierOutboxEvent(pool, 'orders.po.supplier_delivery_confirmed.v1', id, {
      orderId: id,
      currentStatus,
      actor: { type: 'supplier', id: req.supplierId },
      isReorder: checkResult.rows[0].order_type === 'reorder',
      confirmedAt: new Date().toISOString(),
    });

    res.json({
      data: {
        id: result.rows[0].id,
        status: result.rows[0].status,
        updatedAt: result.rows[0].updated_at,
      },
      message: 'Delivery confirmation recorded. Retailer will confirm receipt via GRN.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/v1/supplier/orders/:orderId/items/:itemId/status
 * GL-WF-038: Update individual order item status
 * SEC-001: Requires ACTIVE supplier status
 */
router.patch("/orders/:orderId/items/:itemId/status", requireSupplierAuth, requireActiveSupplier, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const { orderId, itemId } = req.params;
    // R6.CROSS.010: Supplier can only change item status, NOT received_quantity.
    // received_quantity is updated only through GRN (retailer receive flow) with inventory-service call.
    const { status } = req.body;

    const validStatuses = ['pending', 'partial', 'received', 'rejected'];
    if (!status || !validStatuses.includes(status)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: `Status must be one of: ${validStatuses.join(', ')}` }
      });
      return;
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    // Verify this item belongs to an order from this supplier
    const checkResult = await pool.query(
      `SELECT poi.id, poi.status as current_status, poi.ordered_quantity, poi.received_quantity,
              po.id as order_id, po.status as order_status
       FROM orders.purchase_order_items poi
       JOIN orders.purchase_orders po ON po.id = poi.order_id
       JOIN catalog.supplier_products sp ON sp.id = poi.supplier_product_id
       WHERE poi.id = $1 AND po.id = $2 AND sp.supplier_id = $3`,
      [itemId, orderId, req.supplierId]
    );

    if (checkResult.rows.length === 0) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Order item not found' }
      });
      return;
    }

    const item = checkResult.rows[0];

    // Update item status only (not received_quantity)
    const result = await pool.query(
      `UPDATE orders.purchase_order_items
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, status, received_quantity, ordered_quantity, updated_at`,
      [status, itemId]
    );

    // Log the item status change
    await pool.query(
      `INSERT INTO orders.order_events (purchase_order_id, event_type, actor_id, actor_type, metadata)
       VALUES ($1, $2, $3, 'supplier', $4)`,
      [
        orderId,
        'item_status_changed',
        req.supplierId,
        JSON.stringify({
          itemId,
          fromStatus: item.current_status,
          toStatus: status,
        }),
      ]
    );

    res.json({
      data: {
        id: result.rows[0].id,
        status: result.rows[0].status,
        receivedQuantity: result.rows[0].received_quantity,
        orderedQuantity: result.rows[0].ordered_quantity,
        updatedAt: result.rows[0].updated_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/supplier/orders/:id/notes
 * GO-LIVE-030: Get order notes/communication
 * SEC-001: Allow registered suppliers to view order notes
 */
router.get("/orders/:id/notes", requireSupplierAuth, requireRegisteredSupplier, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    // Verify this order contains items from this supplier
    const checkResult = await pool.query(
      `SELECT DISTINCT po.id
       FROM orders.purchase_orders po
       JOIN orders.purchase_order_items poi ON poi.order_id = po.id
       JOIN catalog.supplier_products sp ON sp.id = poi.supplier_product_id
       WHERE po.id = $1 AND sp.supplier_id = $2`,
      [id, req.supplierId]
    );

    if (checkResult.rows.length === 0) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Order not found' }
      });
      return;
    }

    // Get notes (exclude internal notes not from this supplier)
    const result = await pool.query(
      `SELECT id, author_type, author_name, message, is_internal, created_at
       FROM orders.order_notes
       WHERE order_id = $1
         AND (is_internal = false OR (is_internal = true AND author_type = 'supplier' AND author_id = $2))
       ORDER BY created_at ASC`,
      [id, req.supplierId]
    );

    res.json({
      data: result.rows.map(note => ({
        id: note.id,
        authorType: note.author_type,
        authorName: note.author_name,
        message: note.message,
        isInternal: note.is_internal,
        createdAt: note.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/supplier/orders/:id/notes
 * GO-LIVE-030: Add a note to an order
 * SEC-001: Requires ACTIVE supplier status
 */
router.post("/orders/:id/notes", requireSupplierAuth, requireActiveSupplier, async (req: SupplierAuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { message, isInternal } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Message is required' }
      });
      return;
    }

    if (message.length > 2000) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Message cannot exceed 2000 characters' }
      });
      return;
    }

    const pool = getPool();
    if (!pool) {
      res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
      return;
    }

    // Verify this order contains items from this supplier and get supplier name
    const checkResult = await pool.query(
      `SELECT DISTINCT po.id, sup.business_name
       FROM orders.purchase_orders po
       JOIN orders.purchase_order_items poi ON poi.order_id = po.id
       JOIN catalog.supplier_products sp ON sp.id = poi.supplier_product_id
       JOIN supplier.suppliers sup ON sup.id = sp.supplier_id
       WHERE po.id = $1 AND sp.supplier_id = $2`,
      [id, req.supplierId]
    );

    if (checkResult.rows.length === 0) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Order not found' }
      });
      return;
    }

    const supplierName = checkResult.rows[0].business_name || 'Supplier';

    // Insert the note
    const result = await pool.query(
      `INSERT INTO orders.order_notes (order_id, author_type, author_id, author_name, message, is_internal)
       VALUES ($1, 'supplier', $2, $3, $4, $5)
       RETURNING id, author_type, author_name, message, is_internal, created_at`,
      [id, req.supplierId, supplierName, message.trim(), isInternal === true]
    );

    // Log the note event
    await pool.query(
      `INSERT INTO orders.order_events (purchase_order_id, event_type, actor_id, actor_type, metadata)
       VALUES ($1, 'note_added', $2, 'supplier', $3)`,
      [
        id,
        req.supplierId,
        JSON.stringify({ noteId: result.rows[0].id, isInternal: isInternal === true }),
      ]
    );

    res.status(201).json({
      data: {
        id: result.rows[0].id,
        authorType: result.rows[0].author_type,
        authorName: result.rows[0].author_name,
        message: result.rows[0].message,
        isInternal: result.rows[0].is_internal,
        createdAt: result.rows[0].created_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

export const supplierOrdersRouter = router;
