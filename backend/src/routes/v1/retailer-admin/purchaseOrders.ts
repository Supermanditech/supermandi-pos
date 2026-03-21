// T-180: Retailer Purchase Order Visibility (read-only)
// Allows retailers to view purchase orders placed from POS for their store

import { Router, Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { getPool } from "../../../db/client";
import { getStoreId, requireStoreContext } from "../../../middleware/retailerStoreContext";
import { asError } from "../../../lib/errorUtils";

export const retailerPurchaseOrdersRouter = Router();

retailerPurchaseOrdersRouter.use(requireStoreContext);

/**
 * GET /api/v1/retailer-admin/purchase-orders
 * List purchase orders for the retailer's store
 */
retailerPurchaseOrdersRouter.get("/purchase-orders", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    if (!pool) { res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database unavailable" } }); return; }

    const storeId = getStoreId(req);
    if (!storeId) { res.status(400).json({ error: { code: "NO_STORE", message: "Store context required" } }); return; }

    const limit = Math.min(parseInt(String(req.query.limit)) || 20, 100);
    const offset = Math.max(parseInt(String(req.query.offset)) || 0, 0);
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;

    let whereClause = "WHERE po.store_id = $1";
    const params: any[] = [storeId];
    let paramIdx = 2;

    if (status && status !== "all") {
      whereClause += ` AND po.status = $${paramIdx}`;
      params.push(status);
      paramIdx++;
    }

    if (search) {
      whereClause += ` AND (po.order_number ILIKE $${paramIdx} OR s.business_name ILIKE $${paramIdx} OR s.trade_name ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    // Count total
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM orders.purchase_orders po
       LEFT JOIN supplier.suppliers s ON s.id = po.supplier_id
       ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total || "0", 10);

    // Get orders with supplier info
    const result = await pool.query(
      `SELECT
         po.id,
         po.order_number as "poNumber",
         po.supplier_id as "supplierId",
         COALESCE(s.business_name, s.trade_name) as "supplierName",
         s.primary_phone as "supplierPhone",
         po.created_at as "orderDate",
         po.expected_delivery_date as "expectedDeliveryDate",
         po.total_amount as "totalMinor",
         po.status,
         po.store_notes as notes,
         po.created_at as "createdAt",
         (SELECT COUNT(*) FROM orders.purchase_order_items poi WHERE poi.order_id = po.id) as "itemsCount"
       FROM orders.purchase_orders po
       LEFT JOIN supplier.suppliers s ON s.id = po.supplier_id
       ${whereClause}
       ORDER BY po.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    );

    res.json({
      success: true,
      data: result.rows,
      total,
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    // Table might not exist yet — return empty
    if (error.code === "42P01") {
      res.json({ success: true, data: [], total: 0 });
      return;
    }
    next(error);
  }
});

/**
 * GET /api/v1/retailer-admin/purchase-orders/:orderId
 * Get purchase order detail with line items (only if store owns it)
 */
retailerPurchaseOrdersRouter.get("/purchase-orders/:orderId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    if (!pool) { res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database unavailable" } }); return; }

    const storeId = getStoreId(req);
    if (!storeId) { res.status(400).json({ error: { code: "NO_STORE", message: "Store context required" } }); return; }

    const { orderId } = req.params;

    // Get order (with store isolation)
    const orderResult = await pool.query(
      `SELECT
         po.id,
         po.order_number as "poNumber",
         po.supplier_id as "supplierId",
         COALESCE(s.business_name, s.trade_name) as "supplierName",
         s.primary_phone as "supplierPhone",
         po.created_at as "orderDate",
         po.expected_delivery_date as "expectedDeliveryDate",
         po.total_amount as "totalMinor",
         po.subtotal,
         po.tax_amount as "taxAmount",
         po.delivery_charges as "deliveryCharges",
         po.discount_amount as "discountAmount",
         po.status,
         po.payment_status as "paymentStatus",
         po.store_notes as notes,
         po.created_at as "createdAt"
       FROM orders.purchase_orders po
       LEFT JOIN supplier.suppliers s ON s.id = po.supplier_id
       WHERE po.id = $1 AND po.store_id = $2`,
      [orderId, storeId]
    );

    if (orderResult.rows.length === 0) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Purchase order not found" } });
      return;
    }

    // Get line items
    const itemsResult = await pool.query(
      `SELECT
         poi.id,
         poi.product_name as "productName",
         poi.barcode,
         poi.ordered_quantity as quantity,
         'pcs' as unit,
         poi.unit_price as "unitPriceMinor",
         poi.line_total as "totalMinor"
       FROM orders.purchase_order_items poi
       WHERE poi.order_id = $1
       ORDER BY poi.created_at`,
      [orderId]
    );

    const order = {
      ...orderResult.rows[0],
      itemsCount: itemsResult.rows.length,
      items: itemsResult.rows,
    };

    res.json({ success: true, data: order });
  } catch (_error: unknown) {
    const error = asError(_error);
    if (error.code === "42P01") {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Purchase order not found" } });
      return;
    }
    next(error);
  }
});

/**
 * GCP-STG-0094: POST /api/v1/retailer-admin/purchase-orders/:poId/buy-again
 * Duplicate a delivered PO as a new draft with same items + supplier
 */
retailerPurchaseOrdersRouter.post("/purchase-orders/:poId/buy-again", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    if (!pool) { res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database unavailable" } }); return; }

    const storeId = getStoreId(req);
    const { poId } = req.params;

    // 1. Get original PO (store isolation)
    const poRes = await pool.query(
      `SELECT id, supplier_id, notes FROM orders.purchase_orders WHERE id = $1 AND store_id = $2`,
      [poId, storeId]
    );
    if (poRes.rows.length === 0) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Purchase order not found" } });
      return;
    }
    const originalPO = poRes.rows[0];

    // 2. Get original PO items
    const itemsRes = await pool.query(
      `SELECT product_id, product_name, barcode, quantity, unit, unit_price_minor
       FROM orders.purchase_order_items WHERE purchase_order_id = $1
       ORDER BY sort_order ASC`,
      [poId]
    );

    if (itemsRes.rows.length === 0) {
      res.status(400).json({ error: { code: "EMPTY_PO", message: "Original PO has no items to reorder" } });
      return;
    }

    // 3. Create new draft PO
    const newPoId = randomUUID();
    const newPoNumber = `PO-${Date.now().toString(36).toUpperCase()}`;
    const totalMinor = itemsRes.rows.reduce((sum: number, r: any) => sum + (Number(r.quantity) * Number(r.unit_price_minor || 0)), 0);

    await pool.query(
      `INSERT INTO orders.purchase_orders (id, store_id, po_number, supplier_id, status, total_minor, notes, items_count)
       VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7)`,
      [newPoId, storeId, newPoNumber, originalPO.supplier_id, totalMinor, `Reorder from ${poId}`, itemsRes.rows.length]
    );

    // 4. Copy items to new PO
    for (let i = 0; i < itemsRes.rows.length; i++) {
      const item = itemsRes.rows[i];
      await pool.query(
        `INSERT INTO orders.purchase_order_items (id, purchase_order_id, product_id, product_name, barcode, quantity, unit, unit_price_minor, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [randomUUID(), newPoId, item.product_id, item.product_name, item.barcode, item.quantity, item.unit, item.unit_price_minor, i]
      );
    }

    res.json({
      success: true,
      data: {
        id: newPoId,
        poNumber: newPoNumber,
        status: "draft",
        itemsCount: itemsRes.rows.length,
        totalMinor,
      },
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    if ((error as any).code === "42P01") {
      res.status(404).json({ error: { code: "TABLE_MISSING", message: "Purchase orders not available" } });
      return;
    }
    next(error);
  }
});
