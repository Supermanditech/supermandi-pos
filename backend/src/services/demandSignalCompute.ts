/**
 * V3-HARDEN-185: Live demand signal compute engine
 *
 * Computes StoreSKUDemandSnapshot from real DB tables:
 * - public.sales + public.sale_items → sell-through velocity
 * - inventory.stock_balances → current stock
 * - orders.purchase_orders + orders.purchase_order_items → pending inbound
 * - public.supplier_demand_allocations → allocation state
 *
 * Idempotent recompute: same inputs → same outputs.
 * Freshness: every snapshot carries computedAt + snapshotVersion.
 */

import { Pool } from "pg";
import { getPool } from "../db/client";
import { log } from "../lib/logger";
import type { StoreSKUDemandSnapshot, ReorderRecommendation } from "./storeDemandSignal";
import { calculateReorderSuggestion } from "./storeDemandSignal";

/** Versioned demand snapshot with freshness metadata */
export interface VersionedDemandSnapshot extends StoreSKUDemandSnapshot {
  /** ISO timestamp when this snapshot was computed */
  computedAt: string;
  /** Monotonic version (epoch ms of compute) */
  snapshotVersion: number;
  /** Product name for display */
  productName: string;
  /** Barcode if available */
  barcode: string | null;
}

/** Demand signal summary for a store */
export interface StoreDemandSummary {
  storeId: string;
  totalProducts: number;
  needsReorderCount: number;
  criticalCount: number;
  computedAt: string;
  snapshotVersion: number;
  signals: VersionedDemandSnapshot[];
}

/** Admin cross-store demand pressure */
export interface CrossStoreDemandPressure {
  productId: string;
  productName: string;
  totalStores: number;
  storesNeedingReorder: number;
  avgDaysOfStock: number;
  totalPendingInbound: number;
}

/**
 * Compute demand signals for all active SKUs in a store.
 * Queries real sales (7d + 30d), current stock, and pending inbound.
 */
export async function computeStoreDemandSignals(
  storeId: string,
  options: { reorderThresholdDays?: number } = {}
): Promise<StoreDemandSummary> {
  const pool = getPool();
  if (!pool) {
    throw new Error("Database unavailable");
  }

  const reorderThresholdDays = options.reorderThresholdDays ?? 7;
  const now = new Date();
  const computedAt = now.toISOString();
  const snapshotVersion = now.getTime();

  // Single query: join store_products + stock_balances + sales velocity + pending inbound
  const result = await pool.query<{
    product_id: string;
    product_name: string;
    barcode: string | null;
    current_stock: number;
    sold_7d: number;
    sold_30d: number;
    last_sale_at: string | null;
    last_stock_event_at: string | null;
    pending_inbound: number;
  }>(
    `WITH sales_7d AS (
      SELECT si.product_id, COALESCE(SUM(si.quantity), 0)::int AS sold
      FROM public.sale_items si
      JOIN public.sales s ON s.id = si.sale_id
      WHERE s.store_id = $1
        AND s.status = 'completed'
        AND s.created_at >= NOW() - INTERVAL '7 days'
      GROUP BY si.product_id
    ),
    sales_30d AS (
      SELECT si.product_id, COALESCE(SUM(si.quantity), 0)::int AS sold
      FROM public.sale_items si
      JOIN public.sales s ON s.id = si.sale_id
      WHERE s.store_id = $1
        AND s.status = 'completed'
        AND s.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY si.product_id
    ),
    last_sale AS (
      SELECT si.product_id, MAX(s.created_at) AS last_at
      FROM public.sale_items si
      JOIN public.sales s ON s.id = si.sale_id
      WHERE s.store_id = $1 AND s.status = 'completed'
      GROUP BY si.product_id
    ),
    pending_orders AS (
      SELECT poi.product_id, COALESCE(SUM(poi.quantity), 0)::int AS pending
      FROM orders.purchase_order_items poi
      JOIN orders.purchase_orders po ON po.id = poi.purchase_order_id
      WHERE po.store_id = $1
        AND po.status IN ('submitted', 'confirmed', 'shipped')
      GROUP BY poi.product_id
    )
    SELECT
      sp.product_id,
      COALESCE(sp.name, p.name, 'Unknown') AS product_name,
      COALESCE(sp.barcode, p.barcode) AS barcode,
      COALESCE(sb.current_qty, sp.current_stock, 0)::int AS current_stock,
      COALESCE(s7.sold, 0)::int AS sold_7d,
      COALESCE(s30.sold, 0)::int AS sold_30d,
      ls.last_at AS last_sale_at,
      sb.updated_at AS last_stock_event_at,
      COALESCE(po.pending, 0)::int AS pending_inbound
    FROM catalog.store_products sp
    LEFT JOIN catalog.products p ON p.id = sp.product_id
    LEFT JOIN inventory.stock_balances sb ON sb.product_id = sp.product_id AND sb.store_id = sp.store_id
    LEFT JOIN sales_7d s7 ON s7.product_id = sp.product_id
    LEFT JOIN sales_30d s30 ON s30.product_id = sp.product_id
    LEFT JOIN last_sale ls ON ls.product_id = sp.product_id
    LEFT JOIN pending_orders po ON po.product_id = sp.product_id
    WHERE sp.store_id = $1 AND sp.is_active = true
    ORDER BY COALESCE(s7.sold, 0) DESC`,
    [storeId]
  );

  const signals: VersionedDemandSnapshot[] = result.rows.map((row) => {
    const dailyVelocity = row.sold_7d > 0
      ? row.sold_7d / 7
      : row.sold_30d > 0
        ? row.sold_30d / 30
        : 0;

    const daysOfStock = dailyVelocity > 0
      ? row.current_stock / dailyVelocity
      : row.current_stock > 0 ? 999 : 0;

    const snapshot: StoreSKUDemandSnapshot = {
      storeId,
      productId: row.product_id,
      currentStock: row.current_stock,
      soldLast7Days: row.sold_7d,
      soldLast30Days: row.sold_30d,
      dailyVelocity: Math.round(dailyVelocity * 100) / 100,
      daysOfStock: Math.round(daysOfStock * 10) / 10,
      pendingInbound: row.pending_inbound,
      needsReorder: false,
      lastSaleAt: row.last_sale_at,
      lastStockEventAt: row.last_stock_event_at,
    };

    const reorder = calculateReorderSuggestion(snapshot, reorderThresholdDays);
    snapshot.needsReorder = reorder.needsReorder;

    return {
      ...snapshot,
      computedAt,
      snapshotVersion,
      productName: row.product_name,
      barcode: row.barcode,
    };
  });

  const needsReorderCount = signals.filter((s) => s.needsReorder).length;
  const criticalCount = signals.filter((s) => s.daysOfStock <= 1 && s.dailyVelocity > 0).length;

  return {
    storeId,
    totalProducts: signals.length,
    needsReorderCount,
    criticalCount,
    computedAt,
    snapshotVersion,
    signals,
  };
}

/**
 * Build reorder recommendations from computed demand signals.
 */
export function buildReorderRecommendations(
  summary: StoreDemandSummary,
  reorderThresholdDays: number = 7
): ReorderRecommendation[] {
  return summary.signals
    .filter((s) => s.needsReorder)
    .map((s) => {
      const suggestion = calculateReorderSuggestion(s, reorderThresholdDays);
      return {
        productId: s.productId,
        productName: s.productName,
        barcode: s.barcode,
        supplierId: null, // Resolved at order time from supplier mapping
        supplierName: null,
        currentStock: s.currentStock,
        dailyVelocity: s.dailyVelocity,
        daysOfStock: s.daysOfStock,
        suggestedQuantity: suggestion.suggestedQuantity,
        isRepeat: s.soldLast30Days > 0,
        lastOrderId: null,
      };
    })
    .sort((a, b) => a.daysOfStock - b.daysOfStock);
}

/**
 * Cross-store demand pressure for superadmin dashboard.
 */
export async function computeCrossStoreDemandPressure(
  options: { limit?: number } = {}
): Promise<CrossStoreDemandPressure[]> {
  const pool = getPool();
  if (!pool) throw new Error("Database unavailable");

  const limit = options.limit ?? 50;

  const result = await pool.query<{
    product_id: string;
    product_name: string;
    total_stores: number;
    stores_needing_reorder: number;
    avg_days_of_stock: number;
    total_pending_inbound: number;
  }>(
    `WITH store_demand AS (
      SELECT
        sp.product_id,
        COALESCE(p.name, sp.name, 'Unknown') AS product_name,
        sp.store_id,
        COALESCE(sb.current_qty, sp.current_stock, 0) AS current_stock,
        COALESCE(s7.sold, 0) AS sold_7d,
        COALESCE(po.pending, 0) AS pending_inbound
      FROM catalog.store_products sp
      LEFT JOIN catalog.products p ON p.id = sp.product_id
      LEFT JOIN inventory.stock_balances sb ON sb.product_id = sp.product_id AND sb.store_id = sp.store_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(si.quantity), 0)::int AS sold
        FROM public.sale_items si
        JOIN public.sales s ON s.id = si.sale_id
        WHERE s.store_id = sp.store_id
          AND si.product_id = sp.product_id
          AND s.status = 'completed'
          AND s.created_at >= NOW() - INTERVAL '7 days'
      ) s7 ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(poi.quantity), 0)::int AS pending
        FROM orders.purchase_order_items poi
        JOIN orders.purchase_orders po ON po.id = poi.purchase_order_id
        WHERE po.store_id = sp.store_id
          AND poi.product_id = sp.product_id
          AND po.status IN ('submitted', 'confirmed', 'shipped')
      ) po ON true
      WHERE sp.is_active = true
    )
    SELECT
      product_id,
      product_name,
      COUNT(DISTINCT store_id)::int AS total_stores,
      COUNT(DISTINCT store_id) FILTER (
        WHERE sold_7d > 0 AND current_stock < (sold_7d::float / 7.0 * 7)
      )::int AS stores_needing_reorder,
      ROUND(AVG(
        CASE WHEN sold_7d > 0 THEN current_stock / (sold_7d::float / 7.0)
             ELSE 999 END
      )::numeric, 1)::float AS avg_days_of_stock,
      COALESCE(SUM(pending_inbound), 0)::int AS total_pending_inbound
    FROM store_demand
    GROUP BY product_id, product_name
    HAVING COUNT(DISTINCT store_id) FILTER (
      WHERE sold_7d > 0 AND current_stock < (sold_7d::float / 7.0 * 7)
    ) > 0
    ORDER BY stores_needing_reorder DESC, avg_days_of_stock ASC
    LIMIT $1`,
    [limit]
  );

  return result.rows.map((r) => ({
    productId: r.product_id,
    productName: r.product_name,
    totalStores: r.total_stores,
    storesNeedingReorder: r.stores_needing_reorder,
    avgDaysOfStock: r.avg_days_of_stock,
    totalPendingInbound: r.total_pending_inbound,
  }));
}
