/**
 * V3-FIX-186: Buy-again / repeat-last-order service
 *
 * Builds a purchase draft from previously procured items.
 * Uses real purchase history + demand signals to populate quantities.
 *
 * Canonical flow:
 *   1. Caller provides product IDs (or "all from last order")
 *   2. Service looks up last purchase prices + supplier from purchases table
 *   3. Service enriches with current stock + demand velocity from demand compute
 *   4. Returns a BuyAgainDraft ready to load into purchaseDraftStore
 *
 * Suppression: Items with pending inbound >= suggested quantity are excluded.
 */

import { getPool } from "../db/client";
import { log } from "../lib/logger";
import { computeStoreDemandSignals } from "./demandSignalCompute";
import { calculateReorderSuggestion } from "./storeDemandSignal";

export interface BuyAgainDraftItem {
  productId: string;
  barcode: string | null;
  name: string;
  quantity: number;
  purchasePriceMinor: number;
  sellingPriceMinor: number;
  currency: string;
  supplierId: string | null;
  supplierName: string | null;
  /** Source: "last_purchase" | "demand_signal" | "manual" */
  source: string;
  /** Current stock for context */
  currentStock: number;
  /** Days of stock remaining */
  daysOfStock: number;
}

export interface BuyAgainDraft {
  storeId: string;
  items: BuyAgainDraftItem[];
  totalItems: number;
  totalAmountMinor: number;
  computedAt: string;
  /** Items excluded due to pending inbound */
  suppressedCount: number;
}

/**
 * Build a buy-again draft from a specific previous purchase order.
 */
export async function buildBuyAgainFromOrder(
  storeId: string,
  orderId: string
): Promise<BuyAgainDraft> {
  const pool = getPool();
  if (!pool) throw new Error("Database unavailable");

  // Fetch items from the referenced purchase
  const result = await pool.query<{
    product_id: string;
    barcode: string | null;
    product_name: string;
    quantity: number;
    unit_cost_minor: number;
    selling_price_minor: number;
    supplier_name: string | null;
    supplier_id: string | null;
  }>(
    `SELECT
      pi.product_id,
      pi.barcode,
      pi.product_name,
      pi.quantity,
      pi.unit_cost_minor,
      COALESCE(pi.selling_price_minor, 0) AS selling_price_minor,
      p.supplier_name,
      p.supplier_id
    FROM purchase_items pi
    JOIN purchases p ON pi.purchase_id = p.id
    WHERE p.store_id = $1 AND p.id = $2
    ORDER BY pi.product_name`,
    [storeId, orderId]
  );

  if (result.rows.length === 0) {
    return {
      storeId,
      items: [],
      totalItems: 0,
      totalAmountMinor: 0,
      computedAt: new Date().toISOString(),
      suppressedCount: 0,
    };
  }

  // Get demand signals for suppression check
  let demandMap = new Map<string, { currentStock: number; daysOfStock: number; pendingInbound: number; dailyVelocity: number }>();
  try {
    const demand = await computeStoreDemandSignals(storeId);
    for (const s of demand.signals) {
      demandMap.set(s.productId, {
        currentStock: s.currentStock,
        daysOfStock: s.daysOfStock,
        pendingInbound: s.pendingInbound,
        dailyVelocity: s.dailyVelocity,
      });
    }
  } catch {
    // Demand compute failure is non-blocking — proceed without suppression
    log.warn("buy-again", "Demand compute unavailable, proceeding without suppression");
  }

  const items: BuyAgainDraftItem[] = [];
  let suppressedCount = 0;

  for (const row of result.rows) {
    const signal = demandMap.get(row.product_id);
    const pendingInbound = signal?.pendingInbound ?? 0;

    // Suppress if pending inbound covers the suggested quantity
    if (pendingInbound >= row.quantity) {
      suppressedCount++;
      continue;
    }

    // Adjust quantity: if demand signal exists, use suggested quantity
    let qty = row.quantity;
    if (signal && signal.dailyVelocity > 0) {
      const suggestion = calculateReorderSuggestion({
        storeId,
        productId: row.product_id,
        currentStock: signal.currentStock,
        soldLast7Days: 0,
        soldLast30Days: 0,
        dailyVelocity: signal.dailyVelocity,
        daysOfStock: signal.daysOfStock,
        pendingInbound: signal.pendingInbound,
        needsReorder: true,
        lastSaleAt: null,
        lastStockEventAt: null,
      });
      if (suggestion.suggestedQuantity > 0) {
        qty = suggestion.suggestedQuantity;
      }
    }

    items.push({
      productId: row.product_id,
      barcode: row.barcode,
      name: row.product_name,
      quantity: qty,
      purchasePriceMinor: row.unit_cost_minor,
      sellingPriceMinor: row.selling_price_minor,
      currency: "INR",
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      source: "last_purchase",
      currentStock: signal?.currentStock ?? 0,
      daysOfStock: signal?.daysOfStock ?? 999,
    });
  }

  const totalAmountMinor = items.reduce((s, i) => s + i.purchasePriceMinor * i.quantity, 0);

  return {
    storeId,
    items,
    totalItems: items.length,
    totalAmountMinor,
    computedAt: new Date().toISOString(),
    suppressedCount,
  };
}

/**
 * Build a buy-again draft from product IDs (demand-driven).
 * Uses last purchase price for each product, demand signal for quantity.
 */
export async function buildBuyAgainFromProducts(
  storeId: string,
  productIds: string[]
): Promise<BuyAgainDraft> {
  const pool = getPool();
  if (!pool) throw new Error("Database unavailable");

  if (productIds.length === 0) {
    return {
      storeId, items: [], totalItems: 0, totalAmountMinor: 0,
      computedAt: new Date().toISOString(), suppressedCount: 0,
    };
  }

  // Fetch last purchase price for each product
  const placeholders = productIds.map((_, i) => `$${i + 2}`).join(",");
  const lastPurchases = await pool.query<{
    product_id: string;
    barcode: string | null;
    product_name: string;
    unit_cost_minor: number;
    selling_price_minor: number;
    supplier_id: string | null;
    supplier_name: string | null;
  }>(
    `SELECT DISTINCT ON (pi.product_id)
      pi.product_id,
      pi.barcode,
      pi.product_name,
      pi.unit_cost_minor,
      COALESCE(pi.selling_price_minor, 0) AS selling_price_minor,
      p.supplier_id,
      p.supplier_name
    FROM purchase_items pi
    JOIN purchases p ON pi.purchase_id = p.id
    WHERE p.store_id = $1 AND pi.product_id IN (${placeholders})
    ORDER BY pi.product_id, p.created_at DESC`,
    [storeId, ...productIds]
  );

  const purchaseMap = new Map(lastPurchases.rows.map((r) => [r.product_id, r]));

  // Get demand signals
  let demandMap = new Map<string, { currentStock: number; daysOfStock: number; pendingInbound: number; dailyVelocity: number; productName: string; barcode: string | null }>();
  try {
    const demand = await computeStoreDemandSignals(storeId);
    for (const s of demand.signals) {
      demandMap.set(s.productId, {
        currentStock: s.currentStock,
        daysOfStock: s.daysOfStock,
        pendingInbound: s.pendingInbound,
        dailyVelocity: s.dailyVelocity,
        productName: s.productName,
        barcode: s.barcode,
      });
    }
  } catch {
    log.warn("buy-again", "Demand compute unavailable");
  }

  const items: BuyAgainDraftItem[] = [];
  let suppressedCount = 0;

  for (const pid of productIds) {
    const purchase = purchaseMap.get(pid);
    const signal = demandMap.get(pid);

    if (!purchase && !signal) continue; // Unknown product

    const pendingInbound = signal?.pendingInbound ?? 0;
    let qty = 1;
    if (signal && signal.dailyVelocity > 0) {
      const suggestion = calculateReorderSuggestion({
        storeId,
        productId: pid,
        currentStock: signal.currentStock,
        soldLast7Days: 0,
        soldLast30Days: 0,
        dailyVelocity: signal.dailyVelocity,
        daysOfStock: signal.daysOfStock,
        pendingInbound: signal.pendingInbound,
        needsReorder: true,
        lastSaleAt: null,
        lastStockEventAt: null,
      });
      qty = Math.max(1, suggestion.suggestedQuantity);
    }

    if (pendingInbound >= qty) {
      suppressedCount++;
      continue;
    }

    items.push({
      productId: pid,
      barcode: purchase?.barcode ?? signal?.barcode ?? null,
      name: purchase?.product_name ?? signal?.productName ?? "Unknown",
      quantity: qty,
      purchasePriceMinor: purchase?.unit_cost_minor ?? 0,
      sellingPriceMinor: purchase?.selling_price_minor ?? 0,
      currency: "INR",
      supplierId: purchase?.supplier_id ?? null,
      supplierName: purchase?.supplier_name ?? null,
      source: purchase ? "last_purchase" : "demand_signal",
      currentStock: signal?.currentStock ?? 0,
      daysOfStock: signal?.daysOfStock ?? 999,
    });
  }

  const totalAmountMinor = items.reduce((s, i) => s + i.purchasePriceMinor * i.quantity, 0);

  return {
    storeId,
    items,
    totalItems: items.length,
    totalAmountMinor,
    computedAt: new Date().toISOString(),
    suppressedCount,
  };
}
