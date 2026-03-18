/**
 * V3-FIX-142 + V3-FIX-144 + V3-HARDEN-146:
 * Principal procurement lane isolation and order orchestration
 *
 * Two procurement lanes exist — they must never mix:
 *
 * 1. CATALOGUE_PRINCIPAL (SuperMandi principal sale):
 *    - Retailer buys from SuperMandi's published catalogue
 *    - Order creates: retailer→SuperMandi purchase + SuperMandi→supplier procurement
 *    - Stock enters only via GRN_CONFIRMED
 *    - Dual invoices: supplier→SuperMandi, SuperMandi→retailer
 *
 * 2. COUNTER_PURCHASE (direct local inward):
 *    - Retailer records direct/local purchases at counter
 *    - No linked upstream order
 *    - Stock enters immediately on manual inward
 *    - Single invoice (supplier→retailer direct)
 */

/** Procurement lane type — every order belongs to exactly one lane */
export type ProcurementLane = "CATALOGUE_PRINCIPAL" | "COUNTER_PURCHASE";

/** Order linkage for principal lane */
export interface LinkedOrderPair {
  /** Retailer-facing purchase order (retailer → SuperMandi) */
  retailerOrderId: string;
  /** Supplier-facing procurement order (SuperMandi → supplier) */
  supplierProcurementId: string;
  /** The supplier fulfilling this procurement */
  supplierId: string;
  /** Store placing the order */
  storeId: string;
}

/**
 * Determine the procurement lane for a given order context.
 */
export function resolveProcurementLane(orderType: string | null | undefined): ProcurementLane {
  if (orderType === "counter_purchase" || orderType === "manual") {
    return "COUNTER_PURCHASE";
  }
  return "CATALOGUE_PRINCIPAL";
}

/**
 * Validate that items in a cart belong to a single procurement lane.
 * Returns true if all items are from the same lane.
 */
export function validateLaneIsolation(
  items: Array<{ lane?: ProcurementLane; orderType?: string }>
): { valid: boolean; error?: string } {
  const lanes = new Set<ProcurementLane>();
  for (const item of items) {
    lanes.add(item.lane ?? resolveProcurementLane(item.orderType));
  }
  if (lanes.size > 1) {
    return {
      valid: false,
      error: "MIXED_PROCUREMENT_LANES: Cannot mix catalogue-principal and counter-purchase items in the same cart/order",
    };
  }
  return { valid: true };
}

/**
 * V3-HARDEN-146: Stock event timing rules per lane.
 *
 * CATALOGUE_PRINCIPAL:
 *   - Stock credit: ONLY on GRN_CONFIRMED (after goods received)
 *   - Checkout does NOT credit stock
 *   - Invoice does NOT credit stock
 *   - Dispatch does NOT credit stock
 *
 * COUNTER_PURCHASE:
 *   - Stock credit: Immediately on manual inward confirmation
 *   - No GRN step required
 */
export const STOCK_EVENT_RULES: Record<ProcurementLane, {
  stockCreditEvent: string;
  stockCreditTiming: string;
  checkoutCreditsStock: boolean;
}> = {
  CATALOGUE_PRINCIPAL: {
    stockCreditEvent: "GRN_CONFIRMED",
    stockCreditTiming: "Only after retailer confirms goods received via GRN screen",
    checkoutCreditsStock: false,
  },
  COUNTER_PURCHASE: {
    stockCreditEvent: "MANUAL_INWARD",
    stockCreditTiming: "Immediately on counter purchase confirmation",
    checkoutCreditsStock: true,
  },
};

/**
 * V3-FIX-143: Supplier visibility rules for principal orders.
 *
 * Pre-acceptance: Only order ID, item list, quantities, delivery address (city-level)
 * Post-acceptance: Add dispatch address, retailer city/state for logistics only
 * Never exposed: Full retailer contact, phone, email, customer list
 */
export interface SupplierOrderVisibility {
  phase: "pre_acceptance" | "post_acceptance";
  orderId: boolean;
  items: boolean;
  quantities: boolean;
  deliveryCity: boolean;
  deliveryFullAddress: boolean;
  retailerName: boolean;
  retailerPhone: boolean;
  retailerEmail: boolean;
}

export const SUPPLIER_VISIBILITY_RULES: Record<string, SupplierOrderVisibility> = {
  pre_acceptance: {
    phase: "pre_acceptance",
    orderId: true,
    items: true,
    quantities: true,
    deliveryCity: true,
    deliveryFullAddress: false,
    retailerName: false,
    retailerPhone: false,
    retailerEmail: false,
  },
  post_acceptance: {
    phase: "post_acceptance",
    orderId: true,
    items: true,
    quantities: true,
    deliveryCity: true,
    deliveryFullAddress: true,
    retailerName: true, // Needed for dispatch label
    retailerPhone: false, // Not needed — SuperMandi handles communication
    retailerEmail: false,
  },
};
