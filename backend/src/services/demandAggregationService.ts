// GCP-STG-0089: Demand Aggregation + Supply Chain
// Cross-store demand aggregation → consolidated POs → delivery tracking
// Builds on existing demandSignalCompute for real-time demand data

import { randomUUID } from "crypto";
import type { Pool } from "pg";
import { log } from "../lib/logger";
import { emitGlobalEvent, emitSupplierEvent } from "./sseService";

// =============================================================================
// Types
// =============================================================================

export interface AggregatedDemand {
  supplierProductId: string;
  productName: string;
  supplierId: string;
  supplierName: string;
  unitPriceMinor: number;
  stores: Array<{
    storeId: string;
    storeName: string;
    currentStock: number;
    dailyVelocity: number;
    daysOfStock: number;
    suggestedQuantity: number;
  }>;
  totalDemand: number;
  storeCount: number;
}

export interface ConsolidatedPO {
  id: string;
  consolidatedPoNumber: string;
  supplierId: string;
  supplierName?: string;
  status: string;
  totalAmountMinor: number;
  totalItems: number;
  storeCount: number;
  dispatchedAt?: string;
  expectedDeliveryDate?: string;
  trackingNumber?: string;
  carrier?: string;
  createdAt: string;
}

export interface ConsolidatedPOItem {
  id: string;
  supplierProductId: string;
  productName: string;
  totalQuantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  storeBreakdown: Array<{ storeId: string; storeName: string; quantity: number }>;
}

// =============================================================================
// Aggregate Demand Across Stores
// =============================================================================

/**
 * Aggregate demand for a supplier's products across all stores.
 * Returns products where multiple stores need reorder.
 */
export async function aggregateDemandBySupplier(
  pool: Pool,
  supplierId: string,
  options: { minStores?: number; reorderThresholdDays?: number } = {}
): Promise<AggregatedDemand[]> {
  const minStores = options.minStores ?? 2;
  const threshold = options.reorderThresholdDays ?? 7;

  const result = await pool.query(
    `WITH store_demand AS (
      SELECT
        sp.id AS supplier_product_id,
        COALESCE(sp.edited_name, sp.name) AS product_name,
        sp.supplier_id,
        COALESCE(s.business_name, s.trade_name) AS supplier_name,
        sp.purchase_price AS unit_price,
        spm.product_id,
        stk.store_id,
        st.name AS store_name,
        COALESCE(sb.current_qty, stk.current_stock, 0) AS current_stock,
        COALESCE(sv.sold_7d, 0) AS sold_7d
      FROM catalog.supplier_products sp
      JOIN supplier.suppliers s ON s.id = sp.supplier_id
      JOIN catalog.supplier_product_map spm ON spm.supplier_product_id = sp.id
      JOIN catalog.store_products stk ON stk.product_id = spm.product_id
      JOIN platform.stores st ON st.id = stk.store_id
      LEFT JOIN inventory.stock_balances sb ON sb.product_id = spm.product_id AND sb.store_id = stk.store_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(si.quantity), 0)::int AS sold_7d
        FROM public.sale_items si
        JOIN public.sales sal ON sal.id = si.sale_id
        WHERE sal.store_id = stk.store_id AND si.product_id = spm.product_id
          AND sal.status = 'completed' AND sal.created_at >= NOW() - INTERVAL '7 days'
      ) sv ON true
      WHERE sp.supplier_id = $1
        AND sp.approval_status = 'approved'
        AND sp.is_active = true
        AND stk.is_active = true
    )
    SELECT
      supplier_product_id, product_name, supplier_id, supplier_name, unit_price,
      store_id, store_name, current_stock, sold_7d,
      CASE WHEN sold_7d > 0 THEN ROUND(sold_7d / 7.0, 2) ELSE 0 END AS daily_velocity,
      CASE WHEN sold_7d > 0 THEN ROUND(current_stock / (sold_7d / 7.0), 1) ELSE 999 END AS days_of_stock
    FROM store_demand
    WHERE sold_7d > 0 AND current_stock < (sold_7d / 7.0 * $2)
    ORDER BY supplier_product_id, days_of_stock ASC`,
    [supplierId, threshold]
  );

  // Group by supplier product
  const grouped = new Map<string, AggregatedDemand>();

  for (const row of result.rows) {
    const key = row.supplier_product_id;
    if (!grouped.has(key)) {
      grouped.set(key, {
        supplierProductId: row.supplier_product_id,
        productName: row.product_name,
        supplierId: row.supplier_id,
        supplierName: row.supplier_name,
        unitPriceMinor: parseInt(row.unit_price, 10) || 0,
        stores: [],
        totalDemand: 0,
        storeCount: 0,
      });
    }

    const demand = grouped.get(key)!;
    const dailyVelocity = parseFloat(row.daily_velocity) || 0;
    const daysOfStock = parseFloat(row.days_of_stock) || 0;
    const suggestedQty = Math.max(1, Math.ceil(dailyVelocity * threshold) - parseInt(row.current_stock, 10));

    demand.stores.push({
      storeId: row.store_id,
      storeName: row.store_name,
      currentStock: parseInt(row.current_stock, 10),
      dailyVelocity,
      daysOfStock,
      suggestedQuantity: suggestedQty,
    });
    demand.totalDemand += suggestedQty;
    demand.storeCount = demand.stores.length;
  }

  // Filter to products needed by minimum number of stores
  return Array.from(grouped.values()).filter(d => d.storeCount >= minStores);
}

// =============================================================================
// Create Consolidated PO
// =============================================================================

/**
 * Create a consolidated PO from aggregated demand.
 * Groups all products for a supplier into a single bulk order.
 */
export async function createConsolidatedPO(
  pool: Pool,
  supplierId: string,
  items: Array<{
    supplierProductId: string;
    productName: string;
    quantity: number;
    unitPriceMinor: number;
    storeBreakdown: Array<{ storeId: string; storeName: string; quantity: number }>;
    sourceOrderIds?: string[];
  }>,
  adminId?: string
): Promise<ConsolidatedPO> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const id = randomUUID();
    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, "");
    const shortId = randomUUID().slice(0, 6).toUpperCase();
    const poNumber = `CPO-${dateStr}-${shortId}`;

    let totalAmount = 0;
    const storeIds = new Set<string>();

    for (const item of items) {
      totalAmount += item.quantity * item.unitPriceMinor;
      for (const sb of item.storeBreakdown) {
        storeIds.add(sb.storeId);
      }
    }

    // Insert consolidated PO
    const poResult = await client.query(
      `INSERT INTO procurement.consolidated_pos (
        id, supplier_id, consolidated_po_number, status,
        total_amount_minor, total_items, store_count, created_by
      ) VALUES ($1, $2, $3, 'draft', $4, $5, $6, $7)
      RETURNING id, consolidated_po_number as "consolidatedPoNumber",
                supplier_id as "supplierId", status,
                total_amount_minor as "totalAmountMinor",
                total_items as "totalItems", store_count as "storeCount",
                created_at as "createdAt"`,
      [id, supplierId, poNumber, totalAmount, items.length, storeIds.size, adminId || null]
    );

    // Insert items
    for (const item of items) {
      await client.query(
        `INSERT INTO procurement.consolidated_po_items (
          consolidated_po_id, supplier_product_id, product_name,
          total_quantity, unit_price_minor, line_total_minor,
          store_breakdown, source_order_ids
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
        [
          id, item.supplierProductId, item.productName,
          item.quantity, item.unitPriceMinor, item.quantity * item.unitPriceMinor,
          JSON.stringify(item.storeBreakdown),
          item.sourceOrderIds || [],
        ]
      );
    }

    await client.query("COMMIT");

    log.info(`[demand-agg] Consolidated PO created: ${poNumber}, supplier=${supplierId}, items=${items.length}, amount=${totalAmount}`);

    return poResult.rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// =============================================================================
// Consolidated PO Lifecycle
// =============================================================================

export async function submitConsolidatedPO(pool: Pool, poId: string): Promise<void> {
  const result = await pool.query(
    `UPDATE procurement.consolidated_pos
     SET status = 'submitted', updated_at = NOW()
     WHERE id = $1::uuid AND status = 'draft'
     RETURNING id, supplier_id, consolidated_po_number`,
    [poId]
  );
  if (result.rowCount === 0) throw new Error("Consolidated PO not found or not in draft status");

  const { supplier_id, consolidated_po_number } = result.rows[0];
  emitSupplierEvent(supplier_id, "consolidated_po.submitted", { poId, poNumber: consolidated_po_number });
  emitGlobalEvent("consolidated_po.submitted", { poId, supplierId: supplier_id, poNumber: consolidated_po_number });
}

export async function updateConsolidatedPOStatus(
  pool: Pool,
  poId: string,
  status: string,
  trackingInfo?: { trackingNumber?: string; carrier?: string; expectedDeliveryDate?: string }
): Promise<void> {
  const validStatuses = ["confirmed", "dispatched", "delivered", "cancelled"];
  if (!validStatuses.includes(status)) throw new Error(`Invalid status: ${status}`);

  const updates = [`status = $2`, `updated_at = NOW()`];
  const params: any[] = [poId, status];
  let idx = 3;

  if (status === "dispatched") {
    updates.push(`dispatched_at = NOW()`);
    if (trackingInfo?.trackingNumber) { updates.push(`tracking_number = $${idx++}`); params.push(trackingInfo.trackingNumber); }
    if (trackingInfo?.carrier) { updates.push(`carrier = $${idx++}`); params.push(trackingInfo.carrier); }
    if (trackingInfo?.expectedDeliveryDate) { updates.push(`expected_delivery_date = $${idx++}`); params.push(trackingInfo.expectedDeliveryDate); }
  }
  if (status === "delivered") {
    updates.push(`actual_delivery_date = CURRENT_DATE`);
  }

  const result = await pool.query(
    `UPDATE procurement.consolidated_pos SET ${updates.join(", ")} WHERE id = $1::uuid RETURNING supplier_id, consolidated_po_number`,
    params
  );

  if (result.rowCount === 0) throw new Error("Consolidated PO not found");

  const { supplier_id, consolidated_po_number } = result.rows[0];
  emitGlobalEvent(`consolidated_po.${status}`, { poId, supplierId: supplier_id, poNumber: consolidated_po_number });
}

// =============================================================================
// List & Query
// =============================================================================

export async function listConsolidatedPOs(
  pool: Pool,
  filters: { supplierId?: string; status?: string; limit?: number; offset?: number }
): Promise<{ data: ConsolidatedPO[]; total: number }> {
  let where = "WHERE 1=1";
  const params: any[] = [];
  let idx = 1;

  if (filters.supplierId) { where += ` AND cpo.supplier_id = $${idx++}::uuid`; params.push(filters.supplierId); }
  if (filters.status) { where += ` AND cpo.status = $${idx++}`; params.push(filters.status); }

  const limit = Math.min(filters.limit || 50, 100);
  const offset = Math.max(filters.offset || 0, 0);

  const countResult = await pool.query(
    `SELECT COUNT(*)::int as total FROM procurement.consolidated_pos cpo ${where}`, params
  );

  const result = await pool.query(
    `SELECT cpo.id, cpo.consolidated_po_number as "consolidatedPoNumber",
            cpo.supplier_id as "supplierId",
            COALESCE(s.business_name, s.trade_name) as "supplierName",
            cpo.status, cpo.total_amount_minor as "totalAmountMinor",
            cpo.total_items as "totalItems", cpo.store_count as "storeCount",
            cpo.dispatched_at as "dispatchedAt",
            cpo.expected_delivery_date as "expectedDeliveryDate",
            cpo.tracking_number as "trackingNumber",
            cpo.carrier, cpo.created_at as "createdAt"
     FROM procurement.consolidated_pos cpo
     LEFT JOIN supplier.suppliers s ON s.id = cpo.supplier_id
     ${where}
     ORDER BY cpo.created_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, limit, offset]
  );

  return { data: result.rows, total: countResult.rows[0]?.total || 0 };
}

export async function getConsolidatedPOItems(pool: Pool, poId: string): Promise<ConsolidatedPOItem[]> {
  const result = await pool.query(
    `SELECT id, supplier_product_id as "supplierProductId",
            product_name as "productName", total_quantity as "totalQuantity",
            unit_price_minor as "unitPriceMinor", line_total_minor as "lineTotalMinor",
            store_breakdown as "storeBreakdown"
     FROM procurement.consolidated_po_items
     WHERE consolidated_po_id = $1::uuid
     ORDER BY product_name`,
    [poId]
  );
  return result.rows;
}
