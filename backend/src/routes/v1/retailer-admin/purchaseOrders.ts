// T-180: Retailer Purchase Order Visibility (read-only)
// Allows retailers to view purchase orders placed from POS for their store

import { Router, Request, Response, NextFunction } from "express";
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
