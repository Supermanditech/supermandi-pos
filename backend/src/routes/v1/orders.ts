// Orders Routes - V3.0.10 compliant
// Purchase orders and GRN endpoints
// GO-LIVE: Uses requireDeviceToken middleware for POS device authentication

import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import { getPool } from "../../db/client";
import { requireDeviceToken, PosDeviceContext } from "../../middleware/deviceToken";
import { isPayoutsEnabled } from "../../services/supplierPayoutService";
// T-232: GRN alert push notifications
import { notifyGrnExcessAlert, notifyGrnMismatch, notifyOrderStatusChange } from "../../services/grnAlertNotificationService";
// SA-P1-002: Spending limit enforcement
import { checkSpendingLimits } from "../../services/spendingLimitService";
import { log } from "../../lib/logger";
import { asError } from "../../lib/errorUtils";

export const ordersRouter = Router();

/**
 * GO-LIVE: Get store ID from device token (set by requireDeviceToken middleware)
 * The middleware already validates store isolation via enforceStoreBinding
 */
function getStoreIdFromDevice(req: Request): string {
  const posDevice = (req as any).posDevice as PosDeviceContext;
  return posDevice.storeId!;
}

// =============================================================================
// PURCHASE ORDER ENDPOINTS
// =============================================================================

/**
 * POST /api/v1/orders/stores/:storeId/orders
 * SUP-POS-001: Create a new purchase order.
 * GO-LIVE: Requires device token authentication
 */
ordersRouter.post("/stores/:storeId/orders", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);
  // V3-FIX-175: Accept paymentMode and accepted terms from checkout
  const { supplierId, orderType, items, storeNotes, deliveryAddress, expectedDeliveryDate, status: requestedStatus, paymentMode } = req.body || {};

  // POS-BUY-004: Allow "draft" or "submitted" status (default: submitted)
  const orderStatus = requestedStatus === "draft" ? "draft" : "submitted";

  // --- Input validation ---
  if (!supplierId || typeof supplierId !== "string") {
    return res.status(400).json({ success: false, error: "invalid_supplier", message: "supplierId is required" });
  }
  // V3-FIX-142: Accept catalogue_principal as valid order type for principal procurement lane
  if (!orderType || !["manual", "reorder", "catalogue_principal"].includes(orderType)) {
    return res.status(400).json({ success: false, error: "invalid_order_type", message: "orderType must be 'manual', 'reorder', or 'catalogue_principal'" });
  }
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: "invalid_items", message: "items array is required and must not be empty" });
  }
  for (const item of items) {
    if (!item.supplierProductId || typeof item.supplierProductId !== "string") {
      return res.status(400).json({ success: false, error: "invalid_item", message: "Each item must have supplierProductId" });
    }
    if (typeof item.quantity !== "number" || item.quantity <= 0) {
      return res.status(400).json({ success: false, error: "invalid_item", message: "Each item must have quantity > 0" });
    }
    if (typeof item.unitPrice !== "number" || item.unitPrice <= 0) {
      return res.status(400).json({ success: false, error: "invalid_item", message: "Each item must have unitPrice > 0" });
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Verify supplier exists and is verified
    const supplierResult = await client.query(
      `SELECT id, business_name, trade_name, status FROM supplier.suppliers WHERE id = $1`,
      [supplierId]
    );
    if (supplierResult.rows.length === 0 || supplierResult.rows[0].status !== "verified") {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, error: "invalid_supplier", message: "Supplier not found or not verified" });
    }
    const supplier = supplierResult.rows[0];
    const supplierName = supplier.business_name || supplier.trade_name || "Unknown Supplier";

    // 2. Verify supplier is linked to this store
    const linkResult = await client.query(
      `SELECT id FROM supplier.supplier_store_links WHERE supplier_id = $1 AND store_id = $2 AND status = 'active'`,
      [supplierId, storeId]
    );
    if (linkResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, error: "supplier_not_linked", message: "Supplier is not linked to this store" });
    }

    // 3. Validate each item against catalog
    let totalAmount = 0;
    const validatedItems: Array<{
      supplierProductId: string;
      productId: string | null;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
      productName: string;
      barcode: string | null;
      billingModel: string;
      hsnCode: string | null;
      gstRate: number;
      unit: string;
    }> = [];

    for (const item of items) {
      const productResult = await client.query(
        `SELECT sp.id, sp.supplier_id, sp.name, sp.barcode, sp.moq, sp.approval_status,
                sp.billing_model, sp.hsn_code, sp.gst_rate, sp.unit,
                spm.product_id
         FROM catalog.supplier_products sp
         LEFT JOIN catalog.supplier_product_map spm ON spm.supplier_product_id = sp.id
         WHERE sp.id = $1`,
        [item.supplierProductId]
      );

      if (productResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false, error: "invalid_product",
          message: `Supplier product not found: ${item.supplierProductId}`,
        });
      }

      const product = productResult.rows[0];

      if (product.supplier_id !== supplierId) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false, error: "invalid_product",
          message: `Product ${item.supplierProductId} does not belong to supplier ${supplierId}`,
        });
      }

      if (product.approval_status !== "approved") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false, error: "product_not_approved",
          message: `Product ${item.supplierProductId} is not approved`,
        });
      }

      const moq = product.moq || 1;
      if (item.quantity < moq) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false, error: "below_moq",
          message: `Quantity ${item.quantity} is below MOQ ${moq}`,
          details: { supplierProductId: item.supplierProductId, moq, requested: item.quantity },
        });
      }

      const lineTotal = item.quantity * item.unitPrice;
      totalAmount += lineTotal;

      validatedItems.push({
        supplierProductId: item.supplierProductId,
        productId: product.product_id || null,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: lineTotal,
        productName: product.name,
        barcode: product.barcode || null,
        billingModel: product.billing_model || "SUPERMANDI_PRINCIPAL",
        hsnCode: product.hsn_code || null,
        gstRate: product.gst_rate ? parseFloat(product.gst_rate) : 0,
        unit: product.unit || "PCS",
      });
    }

    // SA-P1-002: Check spending limits before creating the order
    // Only enforce for non-draft orders (drafts don't count toward spend)
    if (orderStatus !== "draft") {
      const limitCheck = await checkSpendingLimits(pool, storeId, totalAmount);
      if (!limitCheck.allowed) {
        await client.query("ROLLBACK");
        return res.status(422).json({
          success: false,
          error: limitCheck.code,
          period: limitCheck.period,
          current: limitCheck.current,
          limit: limitCheck.limit,
          message: `${limitCheck.period === "daily" ? "Daily" : "Monthly"} spending limit exceeded`,
        });
      }
    }

    // 4. Generate order number
    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, "");
    const shortId = randomUUID().slice(0, 6).toUpperCase();
    const orderNumber = `PO-${dateStr}-${shortId}`;

    // 5. Insert purchase order
    // V3-FIX-142: Resolve procurement lane from orderType
    const { resolveProcurementLane } = require("../../services/procurementLane");
    const procurementLane = resolveProcurementLane(orderType);

    const orderId = randomUUID();

    // V3-FIX-175+177: Build authoritative accepted-term snapshot from published catalog data
    const termSnapItems = [];
    for (const vi of validatedItems) {
      const termRow = await client.query(
        `SELECT ptr_minor, pts_minor, purchase_price, mrp, trade_discount_pct, scheme,
                delivery_sla_days, delivery_days, delivery_terms, credit_days,
                finance_eligible, bnpl_eligible, moq, moq_tiers,
                published_terms_version, published_at
         FROM catalog.supplier_products WHERE id = $1`,
        [vi.supplierProductId]
      );
      const t = termRow.rows[0] || {};
      termSnapItems.push({
        supplierProductId: vi.supplierProductId,
        unitPrice: vi.unitPrice,
        quantity: vi.quantity,
        publishedTerms: {
          ptrMinor: t.ptr_minor, ptsMinor: t.pts_minor,
          purchasePrice: t.purchase_price, mrp: t.mrp,
          tradeDiscountPct: t.trade_discount_pct ? Number(t.trade_discount_pct) : null,
          scheme: t.scheme,
          deliveryDays: t.delivery_sla_days || t.delivery_days,
          deliveryTerms: t.delivery_terms,
          creditDays: t.credit_days,
          financeEligible: t.finance_eligible,
          bnplEligible: t.bnpl_eligible,
          moq: t.moq,
          moqTiers: t.moq_tiers,
          version: t.published_terms_version || 1,
          publishedAt: t.published_at,
        },
        // V3-FIX-175: Resolve which MOQ tier applies to the ordered quantity
        appliedMoqTier: (() => {
          if (!t.moq_tiers) return null;
          try {
            const tiers = typeof t.moq_tiers === 'string' ? JSON.parse(t.moq_tiers) : t.moq_tiers;
            if (!Array.isArray(tiers)) return null;
            const sorted = [...tiers].sort((a: any, b: any) => (b.minQty || 0) - (a.minQty || 0));
            return sorted.find((tier: any) => vi.quantity >= (tier.minQty || 0)) || null;
          } catch { return null; }
        })(),
      });
    }
    const acceptedTermsSnapshot = JSON.stringify({
      version: Math.max(...termSnapItems.map(i => i.publishedTerms.version), 1),
      snapshotAt: new Date().toISOString(),
      items: termSnapItems,
    });

    // GCP-STG-0087: Resolve billing model from first item (all items in single order share same model)
    const orderBillingModel = validatedItems[0]?.billingModel || "SUPERMANDI_PRINCIPAL";

    // GCP-STG-0110: Snapshot delivery terms version at PO creation
    const deliveryTermsVersion = validatedItems[0]?.deliveryTermsVersion ?? 1;

    const orderResult = await client.query(
      `INSERT INTO orders.purchase_orders (
        id, order_number, store_id, supplier_id, order_type, status,
        total_amount, item_count, store_notes, delivery_address,
        expected_delivery_date, created_by_user_id, procurement_lane,
        accepted_terms_snapshot, accepted_terms_version, payment_lane, billing_model, delivery_terms_version
      ) VALUES ($1, $2, $3, $4, $5, $12, $6, $7, $8, $9, $10, NULL, $11, $13, $15, $14, $16, $17)
      RETURNING
        id,
        order_number as "orderNumber",
        store_id as "storeId",
        supplier_id as "supplierId",
        order_type as "orderType",
        status,
        total_amount as "totalAmount",
        item_count as "itemCount",
        store_notes as "storeNotes",
        delivery_address as "deliveryAddress",
        expected_delivery_date as "expectedDeliveryDate",
        procurement_lane as "procurementLane",
        billing_model as "billingModel",
        created_at as "createdAt",
        updated_at as "updatedAt"`,
      [
        orderId, orderNumber, storeId, supplierId, orderType,
        totalAmount, validatedItems.length,
        storeNotes || null, deliveryAddress || null,
        expectedDeliveryDate || null,
        procurementLane,
        orderStatus,
        acceptedTermsSnapshot,
        // V3-FIX-176: Payment lane — SuperMandi principal for catalogue orders
        procurementLane === "CATALOGUE_PRINCIPAL" ? "SUPERMANDI_PRINCIPAL" : null,
        // V3-FIX-175: Real published-term version from snapshot
        Math.max(...termSnapItems.map(i => i.publishedTerms.version), 1),
        // GCP-STG-0087: Billing model from supplier product catalog
        orderBillingModel,
        // GCP-STG-0110: Delivery terms version snapshot
        deliveryTermsVersion,
      ]
    );

    const order = orderResult.rows[0];

    // V3-FIX-144: For principal lane, generate linked procurement reference
    if (procurementLane === "CATALOGUE_PRINCIPAL") {
      const linkedProcurementId = randomUUID();
      await client.query(
        `UPDATE orders.purchase_orders SET linked_procurement_id = $1 WHERE id = $2`,
        [linkedProcurementId, orderId]
      );
      order.linkedProcurementId = linkedProcurementId;

      // V3-FIX-176: Create canonical procurement payment intent for principal orders
      if (paymentMode && paymentMode !== "CASH") {
        const { createPaymentIntent } = require("../../services/procurementPaymentService");
        const providerMap: Record<string, string> = { UPI: 'UPI_DIRECT', BANK: 'RAZORPAY', BNPL: 'BNPL', CREDIT: 'SUPERMANDI_CREDIT' };
        try {
          const intent = await createPaymentIntent(client, {
            storeId, orderId, amountMinor: totalAmount,
            mode: paymentMode, provider: providerMap[paymentMode] || 'MANUAL',
          });
          order.paymentIntentId = intent.id;
          order.paymentIntentStatus = intent.status;
          order.paymentRedirectUrl = intent.redirectUrl;
          order.paymentQrData = intent.qrData;
        } catch (payErr: any) {
          log.warn(`[V3-FIX-176] Payment intent creation failed for order ${orderId}: ${payErr.message}`);
        }
      }
    }

    // 6. Insert order items
    const insertedItems: Array<Record<string, unknown>> = [];
    for (const item of validatedItems) {
      const itemId = randomUUID();
      const itemResult = await client.query(
        `INSERT INTO orders.purchase_order_items (
          id, order_id, store_id, supplier_product_id, product_id,
          ordered_quantity, received_quantity, unit_price, line_total, product_name, status
        ) VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8, $9, 'pending')
        RETURNING
          id,
          order_id as "orderId",
          supplier_product_id as "supplierProductId",
          product_id as "productId",
          ordered_quantity as "orderedQuantity",
          received_quantity as "receivedQuantity",
          unit_price as "unitPrice",
          line_total as "totalPrice",
          status,
          notes`,
        [itemId, orderId, storeId, item.supplierProductId, item.productId, item.quantity, item.unitPrice, item.totalPrice, item.productName]
      );

      insertedItems.push({
        ...itemResult.rows[0],
        productName: item.productName,
        barcode: item.barcode,
      });
    }

    // 7. Log creation event
    try {
      await client.query(
        `INSERT INTO orders.order_events (purchase_order_id, event_type, from_status, to_status, actor_type, metadata)
         VALUES ($1, 'created', NULL, 'submitted', 'system', $2)`,
        [orderId, JSON.stringify({ orderType, itemCount: validatedItems.length })]
      );
    } catch (eventErr: any) {
      log.warn("[Orders] Failed to log creation event:", eventErr.message);
    }

    await client.query("COMMIT");

    log.info(`[SUP-POS-001] Order created: ${orderNumber}, storeId=${storeId}, supplierId=${supplierId}, items=${validatedItems.length}, total=${totalAmount}`);

    // GCP-STG-0087: Auto-generate invoices for submitted orders (non-blocking)
    if (orderStatus === "submitted") {
      import("../../services/orderInvoiceService").then(({ generateOrderInvoices }) => {
        generateOrderInvoices(pool, {
          orderId,
          storeId,
          supplierId,
          billingModel: orderBillingModel as "SUPERMANDI_PRINCIPAL" | "DIRECT_SUPPLIER",
          totalAmount,
          items: validatedItems.map((vi) => ({
            supplierProductId: vi.supplierProductId,
            productName: vi.productName,
            quantity: vi.quantity,
            unitPrice: vi.unitPrice,
            hsnCode: vi.hsnCode || undefined,
            gstRate: vi.gstRate,
            unit: vi.unit,
          })),
        }).catch((err: any) => {
          log.error(`[GCP-STG-0087] Auto-invoice failed for order ${orderId}:`, err?.message);
        });
      }).catch(() => {});
    }

    return res.status(201).json({
      success: true,
      data: {
        ...order,
        supplierName,
        supplierNotes: null,
        actualDeliveryDate: null,
        trackingNumber: null,
        carrier: null,
        createdByUserId: null,
        items: insertedItems,
      },
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    await client.query("ROLLBACK");
    log.error("[SUP-POS-001] Create order error:", error.message);

    if (error.code === "42P01") {
      return res.status(400).json({
        success: false,
        error: "Order system not initialized",
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to create order",
    });
  } finally {
    client.release();
  }
});

/**
 * GET /api/v1/orders/stores/:storeId/orders
 * List purchase orders for a store.
 * GO-LIVE: Requires device token authentication
 */
ordersRouter.get("/stores/:storeId/orders", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);
  const { status, supplierId, fromDate, toDate, page = "1", limit = "20" } = req.query;

  try {
    let whereClause = "WHERE po.store_id = $1";
    const params: any[] = [storeId];
    let paramIndex = 2;

    if (status && typeof status === "string") {
      const statuses = status.split(",").map((s) => s.trim());
      whereClause += ` AND po.status = ANY($${paramIndex}::text[])`;
      params.push(statuses);
      paramIndex++;
    }

    if (supplierId && typeof supplierId === "string") {
      whereClause += ` AND po.supplier_id = $${paramIndex}`;
      params.push(supplierId);
      paramIndex++;
    }

    if (fromDate && typeof fromDate === "string") {
      whereClause += ` AND po.created_at >= $${paramIndex}`;
      params.push(new Date(fromDate).toISOString());
      paramIndex++;
    }

    if (toDate && typeof toDate === "string") {
      whereClause += ` AND po.created_at <= $${paramIndex}`;
      params.push(new Date(toDate).toISOString());
      paramIndex++;
    }

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM orders.purchase_orders po ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total || "0", 10);

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
    const offsetNum = (pageNum - 1) * limitNum;

    // Get paginated results
    const result = await pool.query(
      `SELECT
        po.id,
        po.order_number as "orderNumber",
        po.store_id as "storeId",
        po.supplier_id as "supplierId",
        COALESCE(s.business_name, s.trade_name, 'Unknown Supplier') as "supplierName",
        po.order_type as "orderType",
        po.status,
        po.total_amount as "totalAmount",
        po.item_count as "itemCount",
        po.store_notes as "storeNotes",
        po.supplier_notes as "supplierNotes",
        po.delivery_address as "deliveryAddress",
        po.expected_delivery_date as "expectedDeliveryDate",
        po.actual_delivery_date as "actualDeliveryDate",
        po.tracking_number as "trackingNumber",
        po.carrier,
        po.created_by_user_id as "createdByUserId",
        po.created_at as "createdAt",
        po.updated_at as "updatedAt"
      FROM orders.purchase_orders po
      LEFT JOIN supplier.suppliers s ON s.id = po.supplier_id
      ${whereClause}
      ORDER BY po.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limitNum, offsetNum]
    );

    return res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[Orders] List error:", error.message);

    // If table doesn't exist, return empty list
    if (error.code === "42P01") {
      return res.json({
        success: true,
        data: [],
        pagination: {
          total: 0,
          page: 1,
          limit: 20,
          totalPages: 0,
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to load orders",
    });
  }
});

/**
 * GET /api/v1/orders/stores/:storeId/orders/:orderId
 * Get a single purchase order with items.
 * GO-LIVE: Requires device token authentication
 */
ordersRouter.get("/stores/:storeId/orders/:orderId", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);
  const { orderId } = req.params;

  try {
    // Get order
    const orderResult = await pool.query(
      `SELECT
        po.id,
        po.order_number as "orderNumber",
        po.store_id as "storeId",
        po.supplier_id as "supplierId",
        COALESCE(s.business_name, s.trade_name, 'Unknown Supplier') as "supplierName",
        s.primary_phone as "supplierPhone",
        po.order_type as "orderType",
        po.status,
        po.total_amount as "totalAmount",
        po.item_count as "itemCount",
        po.store_notes as "storeNotes",
        po.supplier_notes as "supplierNotes",
        po.delivery_address as "deliveryAddress",
        po.expected_delivery_date as "expectedDeliveryDate",
        po.actual_delivery_date as "actualDeliveryDate",
        po.tracking_number as "trackingNumber",
        po.carrier,
        po.created_by_user_id as "createdByUserId",
        po.created_at as "createdAt",
        po.updated_at as "updatedAt"
      FROM orders.purchase_orders po
      LEFT JOIN supplier.suppliers s ON s.id = po.supplier_id
      WHERE po.id = $1 AND po.store_id = $2`,
      [orderId, storeId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Order not found",
      });
    }

    const order = orderResult.rows[0];

    // Get order items
    // AUD-050: Fixed p.barcode -> p.primary_barcode (catalog.products has primary_barcode column)
    // ITER2: Added null-safe fallback for barcode
    const itemsResult = await pool.query(
      `SELECT
        poi.id,
        poi.order_id as "orderId",
        poi.supplier_product_id as "supplierProductId",
        poi.product_id as "productId",
        COALESCE(p.name, sp.name, 'Unknown Product') as "productName",
        COALESCE(p.primary_barcode, sp.barcode, '') as "barcode",
        poi.ordered_quantity as "orderedQuantity",
        poi.received_quantity as "receivedQuantity",
        poi.unit_price as "unitPrice",
        poi.line_total as "totalPrice",
        poi.status,
        poi.notes
      FROM orders.purchase_order_items poi
      LEFT JOIN catalog.products p ON p.id = poi.product_id
      LEFT JOIN catalog.supplier_products sp ON sp.id = poi.supplier_product_id
      WHERE poi.order_id = $1
      ORDER BY poi.created_at ASC`,
      [orderId]
    );

    return res.json({
      success: true,
      data: {
        ...order,
        items: itemsResult.rows,
      },
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[Orders] Get error:", error.message);

    // If table doesn't exist
    if (error.code === "42P01") {
      return res.status(404).json({
        success: false,
        error: "Order not found",
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to load order",
    });
  }
});

/**
 * GET /api/v1/orders/stores/:storeId/orders/:orderId/events
 * Get order status history.
 * GO-LIVE: Requires device token authentication
 */
ordersRouter.get("/stores/:storeId/orders/:orderId/events", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);
  const { orderId } = req.params;

  try {
    // PRA-078: JOIN with purchase_orders to enforce store isolation
    const result = await pool.query(
      `SELECT
        oe.id,
        oe.purchase_order_id as "orderId",
        oe.event_type as "eventType",
        oe.from_status as "fromStatus",
        oe.to_status as "toStatus",
        oe.actor_id as "actorId",
        oe.actor_type as "actorType",
        oe.metadata,
        oe.created_at as "createdAt"
      FROM orders.order_events oe
      JOIN orders.purchase_orders po ON po.id = oe.purchase_order_id
      WHERE oe.purchase_order_id = $1 AND po.store_id = $2
      ORDER BY oe.created_at ASC`,
      [orderId, storeId]
    );

    return res.json({
      success: true,
      data: result.rows,
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[Orders] Events error:", error.message);

    // If table doesn't exist, return empty list
    if (error.code === "42P01") {
      return res.json({
        success: true,
        data: [],
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to load order events",
    });
  }
});

/**
 * POST /api/v1/orders/stores/:storeId/orders/:orderId/cancel
 * GL-PO-001: Cancel a purchase order (idempotent).
 * Returns 200 success even if order was already cancelled/deleted.
 * GO-LIVE: Requires device token authentication
 */
ordersRouter.post("/stores/:storeId/orders/:orderId/cancel", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);
  const { orderId } = req.params;
  const { reason } = req.body || {};

  try {
    // Check if order exists
    const orderResult = await pool.query(
      `SELECT id, status FROM orders.purchase_orders WHERE id = $1 AND store_id = $2`,
      [orderId, storeId]
    );

    // GL-PO-001: If order doesn't exist, return success (idempotent)
    if (orderResult.rows.length === 0) {
      log.info(`[Orders] Cancel: order ${orderId} not found, returning idempotent success`);
      return res.json({
        success: true,
        message: "Order already cancelled or deleted",
        alreadyDeleted: true,
      });
    }

    const order = orderResult.rows[0];
    const currentStatus = order.status;

    // GL-PO-001: If already cancelled, return success (idempotent)
    if (currentStatus === "cancelled") {
      return res.json({
        success: true,
        message: "Order already cancelled",
        alreadyDeleted: true,
        data: order,
        transition: { from: "cancelled", to: "cancelled" },
      });
    }

    // Only allow cancelling draft, submitted, or confirmed orders
    const cancellableStatuses = ["draft", "submitted", "confirmed"];
    if (!cancellableStatuses.includes(currentStatus)) {
      return res.status(400).json({
        success: false,
        error: "cannot_cancel",
        message: `Cannot cancel order in ${currentStatus} status`,
      });
    }

    // Update order status to cancelled
    const updateResult = await pool.query(
      `UPDATE orders.purchase_orders
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND store_id = $2
       RETURNING
         id,
         order_number as "orderNumber",
         store_id as "storeId",
         supplier_id as "supplierId",
         order_type as "orderType",
         status,
         total_amount as "totalAmount",
         item_count as "itemCount",
         created_at as "createdAt",
         updated_at as "updatedAt"`,
      [orderId, storeId]
    );

    // Log the cancellation event
    try {
      await pool.query(
        `INSERT INTO orders.order_events (purchase_order_id, event_type, from_status, to_status, actor_type, metadata)
         VALUES ($1, 'status_change', $2, 'cancelled', 'system', $3)`,
        [orderId, currentStatus, JSON.stringify({ reason: reason || "user_cancelled" })]
      );
    } catch (eventErr: any) {
      // Non-critical, just log
      log.warn("[Orders] Failed to log cancel event:", eventErr.message);
    }

    return res.json({
      success: true,
      data: updateResult.rows[0],
      transition: {
        from: currentStatus,
        to: "cancelled",
      },
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[Orders] Cancel error:", error.message);

    // GL-PO-001: If table doesn't exist, return success (idempotent)
    if (error.code === "42P01") {
      return res.json({
        success: true,
        message: "Order system not initialized",
        alreadyDeleted: true,
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to cancel order",
    });
  }
});

/**
 * PATCH /api/v1/orders/stores/:storeId/orders/:orderId/tracking
 * GO-LIVE-242: Update tracking number for a purchase order.
 * Can be called for any non-cancelled order.
 * GO-LIVE: Requires device token authentication
 */
ordersRouter.patch("/stores/:storeId/orders/:orderId/tracking", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);
  const { orderId } = req.params;
  const { trackingNumber, carrier } = req.body || {};

  // Input validation
  if (!trackingNumber || typeof trackingNumber !== "string" || trackingNumber.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: "invalid_tracking",
      message: "trackingNumber is required and must be a non-empty string",
    });
  }

  if (trackingNumber.trim().length > 100) {
    return res.status(400).json({
      success: false,
      error: "invalid_tracking",
      message: "trackingNumber must be 100 characters or fewer",
    });
  }

  try {
    // Build update fields
    const setClauses = ["tracking_number = $3", "updated_at = NOW()"];
    const params: (string | null)[] = [orderId, storeId, trackingNumber.trim()];

    if (carrier && typeof carrier === "string" && carrier.trim().length > 0) {
      setClauses.push(`carrier = $${params.length + 1}`);
      params.push(carrier.trim());
    }

    const updateResult = await pool.query(
      `UPDATE orders.purchase_orders
       SET ${setClauses.join(", ")}
       WHERE id = $1 AND store_id = $2 AND status != 'cancelled'
       RETURNING
         id,
         order_number as "orderNumber",
         store_id as "storeId",
         supplier_id as "supplierId",
         order_type as "orderType",
         status,
         total_amount as "totalAmount",
         item_count as "itemCount",
         store_notes as "storeNotes",
         supplier_notes as "supplierNotes",
         delivery_address as "deliveryAddress",
         expected_delivery_date as "expectedDeliveryDate",
         actual_delivery_date as "actualDeliveryDate",
         tracking_number as "trackingNumber",
         carrier,
         created_by_user_id as "createdByUserId",
         created_at as "createdAt",
         updated_at as "updatedAt"`,
      params
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "not_found",
        message: "Order not found or is cancelled",
      });
    }

    return res.json({
      success: true,
      data: updateResult.rows[0],
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[Orders] Update tracking error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to update tracking number",
    });
  }
});

/**
 * DELETE /api/v1/orders/stores/:storeId/orders/:orderId
 * GL-PO-001: Delete a draft purchase order (idempotent).
 * Returns 200/204 even if order was already deleted.
 * GO-LIVE: Requires device token authentication
 */
ordersRouter.delete("/stores/:storeId/orders/:orderId", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);
  const { orderId } = req.params;

  try {
    // Check if order exists and is in draft status
    const orderResult = await pool.query(
      `SELECT id, status FROM orders.purchase_orders WHERE id = $1 AND store_id = $2`,
      [orderId, storeId]
    );

    // GL-PO-001: If order doesn't exist, return 204 (idempotent success)
    if (orderResult.rows.length === 0) {
      log.info(`[Orders] Delete: order ${orderId} not found, returning idempotent 204`);
      return res.status(204).send();
    }

    const order = orderResult.rows[0];

    // Only allow deleting draft orders
    if (order.status !== "draft") {
      return res.status(400).json({
        success: false,
        error: "cannot_delete",
        message: `Cannot delete order in ${order.status} status. Only draft orders can be deleted.`,
      });
    }

    // PRA-086: Wrap all deletes in a transaction to prevent partial orphans
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // PRA-087: Delete order items with store_id defense-in-depth via EXISTS subquery
      await client.query(
        `DELETE FROM orders.purchase_order_items
         WHERE order_id = $1
           AND EXISTS (SELECT 1 FROM orders.purchase_orders WHERE id = $1 AND store_id = $2)`,
        [orderId, storeId]
      );

      // PRA-087: Delete order events with store_id defense-in-depth via EXISTS subquery
      await client.query(
        `DELETE FROM orders.order_events
         WHERE purchase_order_id = $1
           AND EXISTS (SELECT 1 FROM orders.purchase_orders WHERE id = $1 AND store_id = $2)`,
        [orderId, storeId]
      );

      // Delete the order
      await client.query(
        `DELETE FROM orders.purchase_orders WHERE id = $1 AND store_id = $2`,
        [orderId, storeId]
      );

      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }

    // GL-PO-001: Return 204 No Content on successful delete
    return res.status(204).send();
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[Orders] Delete error:", error.message);

    // GL-PO-001: If table doesn't exist, return 204 (idempotent success)
    if (error.code === "42P01") {
      return res.status(204).send();
    }

    return res.status(500).json({
      success: false,
      error: "Failed to delete order",
    });
  }
});

// =============================================================================
// SM-016: BUY Payment Options API
// =============================================================================

/**
 * GET /api/v1/orders/stores/:storeId/orders/:orderId/payment-options
 * SM-016: Get available payment options for a purchase order
 * Returns UPI, BNPL, and Credit availability based on store eligibility
 */
ordersRouter.get("/stores/:storeId/orders/:orderId/payment-options", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);
  const { orderId } = req.params;

  try {
    // 1. Get order details
    const orderResult = await pool.query(
      `SELECT
        po.id,
        po.total_amount as "totalAmount",
        po.status,
        po.supplier_id as "supplierId",
        COALESCE(s.business_name, s.trade_name, 'Unknown Supplier') as "supplierName",
        s.upi_vpa as "supplierUpiVpa"
      FROM orders.purchase_orders po
      LEFT JOIN supplier.suppliers s ON s.id = po.supplier_id
      WHERE po.id = $1 AND po.store_id = $2`,
      [orderId, storeId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Order not found"
      });
    }

    const order = orderResult.rows[0];

    // Only allow payment for orders in specific statuses
    const payableStatuses = ['confirmed', 'shipped', 'delivered', 'partial_received'];
    if (!payableStatuses.includes(order.status)) {
      return res.status(400).json({
        success: false,
        error: `Order in '${order.status}' status cannot be paid`
      });
    }

    // 2. Get store BNPL/Credit settings
    let bnplAvailable = false;
    let bnplMaxDays = 7;
    let bnplCreditLimit = 0;
    let bnplUsedCredit = 0;
    let creditAvailable = false;
    let creditLimit = 0;
    let creditUsed = 0;
    let creditReason = '';

    try {
      const storeResult = await pool.query(
        `SELECT
          bnpl_enabled,
          bnpl_max_days,
          bnpl_credit_limit,
          credit_enabled,
          credit_limit
        FROM platform.stores
        WHERE id = $1`,
        [storeId]
      );

      if (storeResult.rows.length > 0) {
        const store = storeResult.rows[0];
        bnplAvailable = store.bnpl_enabled === true;
        bnplMaxDays = store.bnpl_max_days || 7;
        bnplCreditLimit = store.bnpl_credit_limit || 0;
        creditAvailable = store.credit_enabled === true;
        creditLimit = store.credit_limit || 0;
      }

      // Get current BNPL usage (pending dues)
      const bnplUsage = await pool.query(
        `SELECT COALESCE(SUM(amount_minor), 0) as used
         FROM payments.buy_payments
         WHERE store_id = $1 AND mode = 'BNPL' AND status = 'pending'`,
        [storeId]
      );
      bnplUsedCredit = parseInt(bnplUsage.rows[0]?.used || '0', 10);

      // Get current credit usage
      const creditUsage = await pool.query(
        `SELECT COALESCE(SUM(amount_minor), 0) as used
         FROM payments.buy_payments
         WHERE store_id = $1 AND mode = 'CREDIT' AND status IN ('pending', 'approved')`,
        [storeId]
      );
      creditUsed = parseInt(creditUsage.rows[0]?.used || '0', 10);

    } catch (_e: unknown) {
    const e = asError(_e);
      // If tables don't exist, continue with defaults
      log.info('[SM-016] Store settings query failed, using defaults:', e.code);
    }

    // 3. Build payment options
    const options: Array<{
      mode: string;
      available: boolean;
      description: string;
      reason?: string;
      maxDays?: number;
      availableCredit?: number;
    }> = [];

    // UPI Option - always available if supplier has VPA
    const upiAvailable = !!order.supplierUpiVpa;
    options.push({
      mode: 'UPI',
      available: upiAvailable,
      description: 'Pay now via UPI',
      reason: upiAvailable ? undefined : 'Supplier UPI not configured'
    });

    // BNPL Option
    const bnplAvailableCredit = Math.max(0, bnplCreditLimit - bnplUsedCredit);
    const bnplCanPay = bnplAvailable && bnplAvailableCredit >= order.totalAmount;
    options.push({
      mode: 'BNPL',
      available: bnplCanPay,
      maxDays: bnplMaxDays,
      availableCredit: bnplAvailableCredit,
      description: `Pay later in ${bnplMaxDays} days`,
      reason: !bnplAvailable ? 'BNPL not enabled for store' :
              bnplAvailableCredit < order.totalAmount ? 'Insufficient BNPL credit' : undefined
    });

    // Credit Option
    const creditAvailableAmount = Math.max(0, creditLimit - creditUsed);
    const creditCanPay = creditAvailable && creditAvailableAmount >= order.totalAmount;
    if (!creditAvailable) {
      creditReason = 'Credit not enabled for store';
    } else if (creditAvailableAmount < order.totalAmount) {
      creditReason = 'Credit limit exhausted';
    }
    options.push({
      mode: 'CREDIT',
      available: creditCanPay,
      availableCredit: creditAvailableAmount,
      description: 'Use your credit line',
      reason: creditReason || undefined
    });

    log.info(`[SM-016] Payment options: orderId=${orderId}, storeId=${storeId}, amount=${order.totalAmount}`);

    return res.json({
      success: true,
      orderAmount: order.totalAmount,
      supplierId: order.supplierId,
      supplierName: order.supplierName,
      options
    });

  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[SM-016] Payment options error:", error.message);

    if (error.code === "42P01") {
      return res.status(400).json({
        success: false,
        error: "Order system not initialized"
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to get payment options"
    });
  }
});

// =============================================================================
// SM-017: BUY UPI Payment API
// =============================================================================

/**
 * Generate UPI deep link for supplier payment
 */
function generateSupplierUpiLink(params: {
  vpa: string;
  payeeName: string;
  amountRupees: number;
  txnRef: string;
  note: string;
}): string {
  const encodedName = encodeURIComponent(params.payeeName);
  const encodedNote = encodeURIComponent(params.note);
  return `upi://pay?pa=${params.vpa}&pn=${encodedName}&am=${params.amountRupees.toFixed(2)}&cu=INR&tr=${params.txnRef}&tn=${encodedNote}`;
}

/**
 * POST /api/v1/orders/stores/:storeId/orders/:orderId/pay
 * SM-017: Initiate UPI payment to supplier for a purchase order
 *
 * Request: { mode: "UPI" | "BNPL" | "CREDIT" }
 * Response: { paymentId, upiCollect?, expiresAt }
 */
ordersRouter.post("/stores/:storeId/orders/:orderId/pay", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);
  const { orderId } = req.params;
  const { mode } = req.body as { mode?: string };

  if (!mode || !['UPI', 'BNPL', 'CREDIT'].includes(mode)) {
    return res.status(400).json({
      success: false,
      error: "mode must be UPI, BNPL, or CREDIT"
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Get order with supplier info
    const orderResult = await client.query(
      `SELECT
        po.id,
        po.order_number,
        po.total_amount,
        po.status,
        po.supplier_id,
        COALESCE(s.business_name, s.trade_name, 'Supplier') as supplier_name,
        s.upi_vpa as supplier_upi_vpa
      FROM orders.purchase_orders po
      LEFT JOIN supplier.suppliers s ON s.id = po.supplier_id
      WHERE po.id = $1 AND po.store_id = $2`,
      [orderId, storeId]
    );

    if (orderResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    const order = orderResult.rows[0];

    // Verify order is in payable status
    const payableStatuses = ['confirmed', 'shipped', 'delivered', 'partial_received'];
    if (!payableStatuses.includes(order.status)) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: `Order in '${order.status}' status cannot be paid`
      });
    }

    // Check for existing pending payment
    // DATA-002: Add store_id filter for store isolation
    const existingPayment = await client.query(
      `SELECT id, status, created_at FROM payments.buy_payments
       WHERE purchase_order_id = $1 AND store_id = $2 AND status IN ('pending', 'initiated')
       ORDER BY created_at DESC LIMIT 1`,
      [orderId, storeId]
    );

    if (existingPayment.rows.length > 0) {
      const existing = existingPayment.rows[0];
      const createdAt = new Date(existing.created_at);
      const expiresAt = new Date(createdAt.getTime() + 15 * 60 * 1000);

      if (expiresAt > new Date()) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          success: false,
          error: "Payment already in progress",
          existingPaymentId: existing.id
        });
      }

      // Mark expired payment as failed
      // DATA-002: Add store_id filter for store isolation
      await client.query(
        `UPDATE payments.buy_payments SET status = 'failed', failure_reason = 'expired' WHERE id = $1 AND store_id = $2`,
        [existing.id, storeId]
      );
    }

    // 2. Handle UPI payment
    if (mode === 'UPI') {
      if (!order.supplier_upi_vpa) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          error: "Supplier UPI not configured",
          code: "SUPPLIER_UPI_NOT_CONFIGURED"
        });
      }

      const paymentId = randomUUID();
      const txnRef = `SM_BUY_${Date.now().toString(36).toUpperCase()}`;
      const amountRupees = order.total_amount / 100;
      const deepLink = generateSupplierUpiLink({
        vpa: order.supplier_upi_vpa,
        payeeName: order.supplier_name,
        amountRupees,
        txnRef,
        note: `PO-${order.order_number}`
      });

      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      // GO-LIVE-122: Create buy_payment record with idempotency key
      const idempotencyKey = `buy_upi_${orderId}_${Date.now()}`;
      await client.query(
        `INSERT INTO payments.buy_payments (
          id, purchase_order_id, store_id, supplier_id, mode, amount_minor,
          upi_txn_ref, upi_deep_link, upi_vpa,
          status, initiated_at, idempotency_key
        ) VALUES ($1, $2, $3, $4, 'UPI', $5, $6, $7, $8, 'initiated', NOW(), $9)
        ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`,
        [paymentId, orderId, storeId, order.supplier_id, order.total_amount, txnRef, deepLink, order.supplier_upi_vpa, idempotencyKey]
      );

      await client.query("COMMIT");

      log.info(`[SM-017] BUY UPI payment initiated: paymentId=${paymentId}, orderId=${orderId}`);

      return res.json({
        success: true,
        paymentId,
        upiCollect: {
          vpa: order.supplier_upi_vpa,
          amount: order.total_amount,
          deepLink
        },
        expiresAt: expiresAt.toISOString()
      });
    }

    // 3. Handle BNPL payment (SM-019: Full BNPL flow)
    if (mode === 'BNPL') {
      // SM-019: Check BNPL eligibility
      // 1. Check store's BNPL credit limit and usage
      const storeResult = await client.query(
        `SELECT bnpl_enabled, bnpl_credit_limit, bnpl_max_days
         FROM platform.stores WHERE id = $1`,
        [storeId]
      );

      if (storeResult.rows.length === 0 || !storeResult.rows[0].bnpl_enabled) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          error: "bnpl_not_enabled",
          message: "BNPL is not enabled for this store"
        });
      }

      const store = storeResult.rows[0];
      const bnplCreditLimit = store.bnpl_credit_limit || 5000000; // Default 50k
      const bnplMaxDays = store.bnpl_max_days || 7;

      // 2. Check current BNPL usage (active drawdowns)
      const usageResult = await client.query(
        `SELECT COALESCE(SUM(principal_minor), 0) as used
         FROM payments.bnpl_drawdowns
         WHERE store_id = $1 AND status = 'active'`,
        [storeId]
      );
      const bnplUsed = parseInt(usageResult.rows[0]?.used || '0', 10);
      const bnplAvailable = Math.max(0, bnplCreditLimit - bnplUsed);

      if (bnplAvailable < order.total_amount) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          error: "bnpl_limit_exceeded",
          message: "Insufficient BNPL credit",
          availableCredit: bnplAvailable,
          requestedAmount: order.total_amount,
          creditLimit: bnplCreditLimit
        });
      }

      // 3. Check if products in order are BNPL eligible (optional strict mode)
      // For MVP, we trust the payment-options API already validated this

      // 4. Create BNPL drawdown record
      const paymentId = randomUUID();
      const drawdownId = randomUUID();
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + bnplMaxDays);
      const dueDateStr = dueDate.toISOString().split('T')[0]; // YYYY-MM-DD

      // Create drawdown
      await client.query(
        `INSERT INTO payments.bnpl_drawdowns (
          id, store_id, supplier_id, purchase_order_id, principal_minor, due_date, status
        ) VALUES ($1, $2, $3, $4, $5, $6, 'active')`,
        [drawdownId, storeId, order.supplier_id, orderId, order.total_amount, dueDateStr]
      );

      // GO-LIVE-122: Create BNPL payment record with idempotency key
      const idempotencyKey = `buy_bnpl_${orderId}_${drawdownId}`;
      await client.query(
        `INSERT INTO payments.buy_payments (
          id, purchase_order_id, store_id, supplier_id, mode, amount_minor,
          bnpl_drawdown_id, status, initiated_at, idempotency_key
        ) VALUES ($1, $2, $3, $4, 'BNPL', $5, $6, 'pending', NOW(), $7)
        ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`,
        [paymentId, orderId, storeId, order.supplier_id, order.total_amount, drawdownId, idempotencyKey]
      );

      // Update order payment status
      await client.query(
        `UPDATE orders.purchase_orders SET payment_status = 'bnpl_pending' WHERE id = $1`,
        [orderId]
      );

      await client.query("COMMIT");

      log.info(`[SM-019] BNPL drawdown created: drawdownId=${drawdownId}, paymentId=${paymentId}, dueDate=${dueDateStr}`);

      return res.json({
        success: true,
        paymentId,
        bnplDrawdownId: drawdownId,
        dueDate: dueDateStr,
        principalMinor: order.total_amount,
        status: "bnpl_active",
        orderStatus: "confirmed",
        message: `BNPL payment recorded. Due by ${dueDateStr}.`
      });
    }

    // 4. Handle CREDIT payment
    if (mode === 'CREDIT') {
      const paymentId = randomUUID();

      // POS-BUY-007: Atomic credit deduction with row-level locking
      // Lock store row to prevent concurrent credit overspend
      const storeCreditResult = await client.query(
        `SELECT credit_limit, credit_enabled FROM platform.stores WHERE id = $1 FOR UPDATE`,
        [storeId]
      );

      if (storeCreditResult.rows.length === 0 || !storeCreditResult.rows[0].credit_enabled) {
        await client.query("ROLLBACK");
        return res.status(400).json({ success: false, error: "Credit is not enabled for this store" });
      }

      const creditLimit = storeCreditResult.rows[0].credit_limit || 0;

      // Calculate current credit usage (within the same transaction, after lock)
      const usageResult = await client.query(
        `SELECT COALESCE(SUM(amount_minor), 0) as used
         FROM payments.buy_payments
         WHERE store_id = $1 AND mode = 'CREDIT' AND status IN ('pending', 'approved')`,
        [storeId]
      );
      const creditUsed = parseInt(usageResult.rows[0]?.used || '0', 10);
      const availableCredit = creditLimit - creditUsed;

      if (availableCredit < order.total_amount) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          error: "insufficient_credit",
          message: `Insufficient credit. Available: ${availableCredit}, Required: ${order.total_amount}`,
        });
      }

      // GO-LIVE-122: Create CREDIT payment with idempotency key
      const idempotencyKey = `buy_credit_${orderId}`;
      await client.query(
        `INSERT INTO payments.buy_payments (
          id, purchase_order_id, store_id, supplier_id, mode, amount_minor,
          status, initiated_at, idempotency_key
        ) VALUES ($1, $2, $3, $4, 'CREDIT', $5, 'approved', NOW(), $6)
        ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`,
        [paymentId, orderId, storeId, order.supplier_id, order.total_amount, idempotencyKey]
      );

      await client.query(
        `UPDATE orders.purchase_orders SET payment_status = 'credit_used' WHERE id = $1`,
        [orderId]
      );

      await client.query("COMMIT");

      log.info(`[SM-017] BUY CREDIT payment created: paymentId=${paymentId}, orderId=${orderId}, creditRemaining=${availableCredit - order.total_amount}`);

      return res.json({
        success: true,
        paymentId,
        mode: 'CREDIT',
        status: 'approved',
        message: 'Payment charged to credit line.',
        creditRemaining: availableCredit - order.total_amount,
      });
    }

    await client.query("ROLLBACK");
    return res.status(400).json({ success: false, error: "Invalid payment mode" });

  } catch (_error: unknown) {
    const error = asError(_error);
    await client.query("ROLLBACK");
    log.error("[SM-017] BUY pay error:", error.message);

    if (error.code === "42P01") {
      return res.status(400).json({ success: false, error: "Payment tables not initialized" });
    }

    return res.status(500).json({ success: false, error: "Failed to initiate payment" });
  } finally {
    client.release();
  }
});

/**
 * POST /api/v1/orders/stores/:storeId/orders/:orderId/pay/confirm
 * SM-017: Confirm UPI payment with UTR from retailer
 *
 * Request: { paymentId, upiTxnRef }
 * Response: { status, orderStatus, payoutScheduled }
 */
ordersRouter.post("/stores/:storeId/orders/:orderId/pay/confirm", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);
  const { orderId } = req.params;
  const { paymentId, upiTxnRef } = req.body as { paymentId?: string; upiTxnRef?: string };

  if (!paymentId) {
    return res.status(400).json({ success: false, error: "paymentId is required" });
  }
  if (!upiTxnRef || typeof upiTxnRef !== 'string' || upiTxnRef.length < 6) {
    return res.status(400).json({ success: false, error: "Valid upiTxnRef (UTR) is required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Get payment record
    const paymentResult = await client.query(
      `SELECT bp.id, bp.purchase_order_id, bp.status, bp.mode, bp.amount_minor, bp.supplier_id
       FROM payments.buy_payments bp
       WHERE bp.id = $1 AND bp.store_id = $2`,
      [paymentId, storeId]
    );

    if (paymentResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, error: "Payment not found" });
    }

    const payment = paymentResult.rows[0];

    if (payment.purchase_order_id !== orderId) {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, error: "Payment does not belong to this order" });
    }

    if (payment.mode !== 'UPI') {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, error: "Only UPI payments require confirmation" });
    }

    if (payment.status === 'completed') {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, error: "Payment already confirmed" });
    }

    if (payment.status !== 'initiated') {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, error: `Cannot confirm payment in '${payment.status}' status` });
    }

    // Update payment to completed
    // DATA-002: Add store_id filter for store isolation
    await client.query(
      `UPDATE payments.buy_payments
       SET status = 'completed', upi_payer_ref = $1, completed_at = NOW()
       WHERE id = $2 AND store_id = $3`,
      [upiTxnRef, paymentId, storeId]
    );

    // Update order payment status
    // DATA-002: Add store_id filter for store isolation
    await client.query(
      `UPDATE orders.purchase_orders SET payment_status = 'paid' WHERE id = $1 AND store_id = $2`,
      [orderId, storeId]
    );

    // GO-LIVE-118: Fetch order total for reconciliation verification
    // XPORT-002: Add store_id filter for store isolation
    const orderResult = await client.query(
      `SELECT total_amount FROM orders.purchase_orders WHERE id = $1 AND store_id = $2`,
      [orderId, storeId]
    );
    const orderTotal = orderResult.rows[0]?.total_amount;

    // GO-LIVE-118: Verify payment amount matches order total (reconciliation)
    if (orderTotal !== undefined && payment.amount_minor !== orderTotal) {
      log.error(`[SM-017] GO-LIVE-118: Payout reconciliation mismatch! payment=${payment.amount_minor}, order=${orderTotal}`);
      // Don't fail the payment, but log critical discrepancy
      // This could indicate a race condition or data corruption
    }

    // POS-UPI-002: Schedule payout to supplier — gate behind feature flag
    const payoutId = randomUUID();
    const payoutsEnabled = isPayoutsEnabled();
    const payoutStatus = payoutsEnabled ? 'scheduled' : 'pending_manual';
    try {
      await client.query(
        `INSERT INTO payments.supplier_payouts (
          id, supplier_id, purchase_order_id, payment_id, amount_minor, status
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [payoutId, payment.supplier_id, orderId, paymentId, payment.amount_minor, payoutStatus]
      );

      // GO-LIVE-118: Track order-payout relationship for audit trail
      await client.query(
        `INSERT INTO supplier.payout_order_items (payout_id, order_id, amount_paise)
         VALUES ($1, $2, $3)`,
        [payoutId, orderId, payment.amount_minor]
      );
    } catch (_e: unknown) {
    const e = asError(_e);
      // Table might not exist yet, log and continue
      log.info('[SM-017] supplier_payouts table not ready:', e.code);
    }

    if (!payoutsEnabled) {
      log.warn(`[SM-017] POS-UPI-002: Automated payouts disabled. Payout ${payoutId} created as pending_manual. Operator must process manually.`);
    }

    await client.query("COMMIT");

    log.info(`[SM-017] BUY payment confirmed: paymentId=${paymentId}, utr=${upiTxnRef}, payoutStatus=${payoutStatus}`);

    return res.json({
      success: true,
      status: 'completed',
      orderStatus: 'paid',
      payoutScheduled: payoutsEnabled,
      payoutStatus,
    });

  } catch (_error: unknown) {
    const error = asError(_error);
    await client.query("ROLLBACK");
    log.error("[SM-017] BUY confirm error:", error.message);

    return res.status(500).json({ success: false, error: "Failed to confirm payment" });
  } finally {
    client.release();
  }
});

// =============================================================================
// GRN (GOODS RECEIVE) ENDPOINTS - AUD-GOLIVE-005
// =============================================================================

/**
 * POST /api/v1/orders/stores/:storeId/orders/:orderId/receive
 * AUD-GOLIVE-005: Receive goods for a purchase order (GRN).
 * Creates a receive record and updates inventory.
 * GO-LIVE: Requires device token authentication
 */
ordersRouter.post("/stores/:storeId/orders/:orderId/receive", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);
  const { orderId } = req.params;
  const { items, notes } = req.body;

  // Validate items array
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      error: "items array is required and must not be empty",
    });
  }

  // Validate each item
  for (const item of items) {
    if (!item.orderItemId) {
      return res.status(400).json({
        success: false,
        error: "Each item must have orderItemId",
      });
    }
    if (typeof item.quantityReceived !== "number" || item.quantityReceived <= 0) {
      return res.status(400).json({
        success: false,
        error: "Each item must have quantityReceived > 0",
      });
    }
  }

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Verify order exists and belongs to this store
      const orderResult = await client.query(
        `SELECT id, status, order_number FROM orders.purchase_orders
         WHERE id = $1 AND store_id = $2`,
        [orderId, storeId]
      );

      if (orderResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          error: "Order not found",
        });
      }

      const order = orderResult.rows[0];

      // Only allow receiving for orders in valid status
      const receivableStatuses = ["confirmed", "shipped", "partial_received"];
      if (!receivableStatuses.includes(order.status)) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          error: `Cannot receive goods for order in '${order.status}' status`,
        });
      }

      // Create receive record
      const receiveResult = await client.query(
        `INSERT INTO orders.order_receives (purchase_order_id, notes)
         VALUES ($1, $2)
         RETURNING id, created_at as "createdAt"`,
        [orderId, notes || null]
      );

      const receiveId = receiveResult.rows[0].id;
      const receiveCreatedAt = receiveResult.rows[0].createdAt;

      // Process each item
      const updatedItems: Array<{
        id: string;
        productName: string;
        orderedQuantity: number;
        receivedQuantity: number;
        status: string;
      }> = [];

      for (const item of items) {
        // Get order item details
        const itemResult = await client.query(
          `SELECT
            poi.id,
            poi.product_id,
            poi.ordered_quantity,
            poi.received_quantity,
            COALESCE(p.name, 'Unknown Product') as "productName"
          FROM orders.purchase_order_items poi
          LEFT JOIN catalog.products p ON p.id = poi.product_id
          WHERE poi.id = $1 AND poi.order_id = $2`,
          [item.orderItemId, orderId]
        );

        if (itemResult.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            success: false,
            error: `Order item not found: ${item.orderItemId}`,
          });
        }

        const orderItem = itemResult.rows[0];
        const newReceivedQty = (orderItem.received_quantity || 0) + item.quantityReceived;

        // STG-509: Reject if total received exceeds ordered + 10% tolerance
        const orderedQty = orderItem.ordered_quantity || 0;
        if (orderedQty > 0 && newReceivedQty > orderedQty * 1.1) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            success: false,
            error: "EXCESS_QUANTITY",
            message: `Item "${orderItem.productName}" would exceed 110% of ordered quantity (ordered: ${orderedQty}, would receive: ${newReceivedQty})`,
          });
        }

        // Determine item status
        let itemStatus = "partial";
        if (newReceivedQty >= orderItem.ordered_quantity) {
          itemStatus = "received";
        }

        // SA-P1-004: Detect excess receipt and create alert for SuperAdmin
        const orderedQtyAlert = orderItem.ordered_quantity || 0;
        if (orderedQtyAlert > 0 && newReceivedQty > orderedQtyAlert) {
          const excessQty = newReceivedQty - orderedQtyAlert;
          const excessPct = parseFloat(((excessQty / orderedQtyAlert) * 100).toFixed(2));
          await client.query(
            `INSERT INTO platform.grn_excess_alerts
             (store_id, purchase_order_id, order_item_id, receive_id,
              product_name, ordered_qty, total_received_qty, excess_qty, excess_pct)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [storeId, orderId, item.orderItemId, receiveId,
             orderItem.productName, orderedQtyAlert, newReceivedQty, excessQty, excessPct]
          );

          // T-232: Send push notification for excess GRN (fire-and-forget, don't block transaction)
          notifyGrnExcessAlert({
            storeId,
            orderId,
            productName: orderItem.productName,
            orderedQty: orderedQtyAlert,
            receivedQty: newReceivedQty,
            excessQty,
            excessPct,
          }).catch(() => { /* non-blocking */ });
        } else if (orderedQty > 0 && newReceivedQty < orderedQty && itemStatus === 'received') {
          // T-232: Short receipt — notify mismatch
          notifyGrnMismatch({
            storeId,
            orderId,
            productName: orderItem.productName,
            orderedQty,
            receivedQty: newReceivedQty,
            shortQty: orderedQty - newReceivedQty,
          }).catch(() => { /* non-blocking */ });
        }

        // Update order item
        await client.query(
          `UPDATE orders.purchase_order_items
           SET received_quantity = $1, status = $2, updated_at = NOW()
           WHERE id = $3`,
          [newReceivedQty, itemStatus, item.orderItemId]
        );

        // Create receive item record
        await client.query(
          `INSERT INTO orders.order_receive_items (receive_id, order_item_id, quantity_received, notes)
           VALUES ($1, $2, $3, $4)`,
          [receiveId, item.orderItemId, item.quantityReceived, item.notes || null]
        );

        // Update inventory (stock balance)
        // T-177: Include stock_version increment for optimistic concurrency
        if (orderItem.product_id) {
          await client.query(
            `INSERT INTO inventory.stock_balances (store_id, product_id, current_qty, stock_version)
             VALUES ($1, $2, $3, 1)
             ON CONFLICT (store_id, product_id)
             DO UPDATE SET current_qty = inventory.stock_balances.current_qty + $3,
                           stock_version = inventory.stock_balances.stock_version + 1,
                           updated_at = NOW()`,
            [storeId, orderItem.product_id, item.quantityReceived]
          );

          // Also update catalog.store_products if it exists
          await client.query(
            `UPDATE catalog.store_products
             SET current_stock = COALESCE(current_stock, 0) + $3, updated_at = NOW()
             WHERE store_id = $1 AND product_id = $2`,
            [storeId, orderItem.product_id, item.quantityReceived]
          );
        }

        updatedItems.push({
          id: item.orderItemId,
          productName: orderItem.productName,
          orderedQuantity: orderItem.ordered_quantity,
          receivedQuantity: newReceivedQty,
          status: itemStatus,
        });
      }

      // Check if all items are fully received
      const remainingResult = await client.query(
        `SELECT COUNT(*) as remaining
         FROM orders.purchase_order_items
         WHERE order_id = $1 AND status != 'received'`,
        [orderId]
      );

      const remainingItems = parseInt(remainingResult.rows[0].remaining, 10);
      const newOrderStatus = remainingItems === 0 ? "delivered" : "partial_received";

      // Update order status
      // V3-FIX-145: Generate invoice_pair_id when order becomes delivered (GRN complete)
      const invoicePairId = newOrderStatus === "delivered" ? randomUUID() : null;
      await client.query(
        `UPDATE orders.purchase_orders
         SET status = $1, updated_at = NOW()${invoicePairId ? ", invoice_pair_id = $3" : ""}
         WHERE id = $2`,
        invoicePairId ? [newOrderStatus, orderId, invoicePairId] : [newOrderStatus, orderId]
      );

      // Log the receive event
      await client.query(
        `INSERT INTO orders.order_events (purchase_order_id, event_type, from_status, to_status, actor_type, metadata)
         VALUES ($1, 'goods_received', $2, $3, 'pos_device', $4)`,
        [
          orderId,
          order.status,
          newOrderStatus,
          JSON.stringify({ receiveId, itemCount: items.length }),
        ]
      );

      // T-232: Notify order status change (fire-and-forget)
      if (newOrderStatus !== order.status) {
        notifyOrderStatusChange({
          storeId,
          orderId,
          supplierId: order.supplier_id,
          oldStatus: order.status,
          newStatus: newOrderStatus,
        }).catch(() => { /* non-blocking */ });
      }

      await client.query("COMMIT");

      return res.status(201).json({
        success: true,
        data: {
          receiveRecord: {
            id: receiveId,
            orderId,
            notes: notes || null,
            createdAt: receiveCreatedAt,
          },
          order: {
            id: orderId,
            orderNumber: order.order_number,
            status: newOrderStatus,
          },
          itemsUpdated: updatedItems,
        },
      });
    } catch (innerError) {
      await client.query("ROLLBACK");
      throw innerError;
    } finally {
      client.release();
    }
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[Orders] Receive error:", error.message);

    if (error.code === "42P01") {
      return res.status(400).json({
        success: false,
        error: "Order system not fully initialized",
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to receive goods",
    });
  }
});

/**
 * GET /api/v1/orders/stores/:storeId/orders/:orderId/receives
 * AUD-GOLIVE-005: Get receive history for an order.
 * GO-LIVE: Requires device token authentication
 */
ordersRouter.get("/stores/:storeId/orders/:orderId/receives", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);
  const { orderId } = req.params;

  try {
    // Verify order belongs to this store
    const orderCheck = await pool.query(
      `SELECT id FROM orders.purchase_orders WHERE id = $1 AND store_id = $2`,
      [orderId, storeId]
    );

    if (orderCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Order not found",
      });
    }

    // Get receive records
    const result = await pool.query(
      `SELECT
        id,
        purchase_order_id as "orderId",
        notes,
        created_at as "createdAt"
      FROM orders.order_receives
      WHERE purchase_order_id = $1
      ORDER BY created_at DESC`,
      [orderId]
    );

    return res.json({
      success: true,
      data: result.rows,
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[Orders] List receives error:", error.message);

    if (error.code === "42P01") {
      return res.json({
        success: true,
        data: [],
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to load receive records",
    });
  }
});

/**
 * GET /api/v1/orders/stores/:storeId/orders/:orderId/receives/:receiveId
 * AUD-GOLIVE-005: Get a specific receive record with items.
 * GO-LIVE: Requires device token authentication
 */
ordersRouter.get("/stores/:storeId/orders/:orderId/receives/:receiveId", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreIdFromDevice(req);
  const { orderId, receiveId } = req.params;

  try {
    // Verify order belongs to this store
    const orderCheck = await pool.query(
      `SELECT id FROM orders.purchase_orders WHERE id = $1 AND store_id = $2`,
      [orderId, storeId]
    );

    if (orderCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Order not found",
      });
    }

    // Get receive record
    const receiveResult = await pool.query(
      `SELECT
        id,
        purchase_order_id as "orderId",
        notes,
        created_at as "createdAt"
      FROM orders.order_receives
      WHERE id = $1 AND purchase_order_id = $2`,
      [receiveId, orderId]
    );

    if (receiveResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Receive record not found",
      });
    }

    const receive = receiveResult.rows[0];

    // Get receive items
    const itemsResult = await pool.query(
      `SELECT
        ori.id,
        ori.order_item_id as "orderItemId",
        ori.quantity_received as "quantityReceived",
        ori.notes,
        COALESCE(p.name, 'Unknown Product') as "productName",
        COALESCE(p.primary_barcode, '') as "barcode"
      FROM orders.order_receive_items ori
      LEFT JOIN orders.purchase_order_items poi ON poi.id = ori.order_item_id
      LEFT JOIN catalog.products p ON p.id = poi.product_id
      WHERE ori.receive_id = $1`,
      [receiveId]
    );

    return res.json({
      success: true,
      data: {
        ...receive,
        items: itemsResult.rows,
      },
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[Orders] Get receive error:", error.message);

    if (error.code === "42P01") {
      return res.status(404).json({
        success: false,
        error: "Receive record not found",
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to load receive record",
    });
  }
});

/**
 * V3-FIX-176: POST /api/v1/orders/procurement/payment-callback
 * Procurement payment callback/webhook handler — reconciles provider payment
 * state into procurement.payment_intents and updates order payment status.
 * Called by provider webhooks (PhonePe/Razorpay/BNPL partner) or by polling.
 */
ordersRouter.post("/procurement/payment-callback", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  // V3-FIX-176: Webhook signature verification — per-provider trust boundary
  const razorpaySignature = req.headers['x-razorpay-signature'] as string | undefined;
  const phonePeVerify = req.headers['x-verify'] as string | undefined;
  const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET;

  // Razorpay webhook: verify HMAC-SHA256 signature
  if (razorpaySignature && webhookSecret) {
    const crypto = require("crypto");
    const expectedSig = crypto.createHmac("sha256", webhookSecret).update(JSON.stringify(req.body)).digest("hex");
    if (expectedSig !== razorpaySignature) {
      log.warn("[payment-callback] Razorpay signature verification FAILED");
      return res.status(401).json({ error: "Invalid Razorpay webhook signature" });
    }
    log.info("[payment-callback] Razorpay signature verified");
  }
  // PhonePe callback: verify X-VERIFY checksum
  else if (phonePeVerify && process.env.PHONEPE_SALT_KEY) {
    const crypto = require("crypto");
    const response = req.body.response || "";
    const saltKey = process.env.PHONEPE_SALT_KEY;
    const saltIndex = process.env.PHONEPE_SALT_INDEX || "1";
    const expectedChecksum = crypto.createHash("sha256").update(response + "/pg/v1/status" + saltKey).digest("hex") + "###" + saltIndex;
    if (expectedChecksum !== phonePeVerify) {
      log.warn("[payment-callback] PhonePe checksum verification FAILED");
      return res.status(401).json({ error: "Invalid PhonePe callback checksum" });
    }
    log.info("[payment-callback] PhonePe checksum verified");
  }
  // Pine Labs: verify via HMAC-SHA256 using verifyPineLabsCallback
  else if (req.body.ppc_DIA_SECRET && process.env.PINE_LABS_SECRET) {
    const { verifyPineLabsCallback } = require("../../services/paymentProviders/pinelabsAdapter");
    const plVerified = await verifyPineLabsCallback(req.body);
    if (!plVerified.success) {
      log.warn("[payment-callback] Pine Labs HMAC verification FAILED");
      return res.status(401).json({ error: "Invalid Pine Labs callback signature" });
    }
    log.info(`[payment-callback] Pine Labs verified: txn=${plVerified.transactionId}`);
  }
  // No known provider signature — reject if webhook secret is configured or in production
  else if (webhookSecret || process.env.NODE_ENV === 'production') {
    log.warn("[payment-callback] No recognized provider signature — rejecting callback");
    return res.status(401).json({ error: "Unrecognized payment callback — no valid provider signature" });
  }

  const { paymentIntentId, providerPaymentId, status, provider: callbackProvider } = req.body;

  if (!paymentIntentId || !status) {
    return res.status(400).json({ error: "paymentIntentId and status are required" });
  }

  const validStatuses = ['pending', 'authorized', 'paid', 'failed', 'refunded', 'expired'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verify the payment intent exists and belongs to the claimed provider
    const intentCheck = await client.query(
      `SELECT id, provider, order_id, status AS current_status FROM procurement.payment_intents WHERE id = $1`,
      [paymentIntentId]
    );
    if (intentCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Payment intent not found" });
    }
    const intent = intentCheck.rows[0];
    // Provider trust: callback provider must match intent provider
    if (callbackProvider && intent.provider !== callbackProvider) {
      await client.query("ROLLBACK");
      log.warn(`[payment-callback] Provider mismatch: intent=${intent.provider}, callback=${callbackProvider}`);
      return res.status(403).json({ error: "Provider mismatch" });
    }
    // Prevent backward status transitions (paid → pending is invalid)
    const statusRank: Record<string, number> = { created: 0, pending: 1, authorized: 2, paid: 3, failed: -1, refunded: -2, expired: -3 };
    const currentRank = statusRank[intent.current_status] ?? 0;
    const newRank = statusRank[status] ?? 0;
    if (currentRank >= 3 && newRank < currentRank && newRank >= 0) {
      await client.query("ROLLBACK");
      log.warn(`[payment-callback] Invalid transition: ${intent.current_status} → ${status}`);
      return res.status(400).json({ error: `Cannot transition from ${intent.current_status} to ${status}` });
    }

    // Update payment intent status
    const { updatePaymentIntentStatus } = require("../../services/procurementPaymentService");
    await updatePaymentIntentStatus(client, paymentIntentId, status, providerPaymentId);

    // Reconcile order payment status from intent status
    const orderId = intent.order_id;
    // V3-FIX-176: Correct status mapping for ALL payment states
    const orderPaymentStatus =
      status === 'paid' ? 'paid' :
      status === 'authorized' ? 'partial' :
      status === 'failed' ? 'failed' :
      status === 'refunded' ? 'refunded' :
      status === 'expired' ? 'failed' :
      'pending';
    await client.query(
      `UPDATE orders.purchase_orders SET payment_status = $1, updated_at = NOW() WHERE id = $2`,
      [orderPaymentStatus, orderId]
    );
    log.info(`[V3-FIX-176] Payment callback: intent=${paymentIntentId}, status=${status}, order=${orderId}, paymentStatus=${orderPaymentStatus}`);

    await client.query("COMMIT");
    return res.json({ success: true, status });
  } catch (err: any) {
    await client.query("ROLLBACK");
    log.error("[V3-FIX-176] Payment callback error:", err.message);
    return res.status(500).json({ error: "Failed to process payment callback" });
  } finally {
    client.release();
  }
});
