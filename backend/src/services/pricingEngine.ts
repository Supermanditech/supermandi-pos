/**
 * V3-FIX-098: Canonical pricing engine for margin calculation
 * Used by admin approve, retailer catalog, and supplier publish flows.
 *
 * Supports:
 *   - percentage margin
 *   - fixed/lumpsum margin
 *   - precedence: product-level > supplier-level > global default
 *   - rounding: Math.round to nearest paisa
 */

export interface MarginConfig {
  type: "percentage" | "fixed";
  value: number; // percentage (0-100) or fixed amount in minor units
}

export interface PricingInput {
  /** Supplier's price to SuperMandi (PTS) in minor units */
  supplierPriceMinor: number;
  /** MRP in minor units (for margin cap validation) */
  mrpMinor?: number;
  /** Product-level margin override */
  productMargin?: MarginConfig | null;
  /** Supplier-level default margin */
  supplierMargin?: MarginConfig | null;
  /** Global default margin */
  globalMargin?: MarginConfig;
}

export interface PricingOutput {
  /** Final retailer purchase price (PTR) in minor units */
  retailerPriceMinor: number;
  /** Applied margin config */
  appliedMargin: MarginConfig;
  /** Margin source: product | supplier | global */
  marginSource: "product" | "supplier" | "global";
}

const DEFAULT_MARGIN: MarginConfig = { type: "percentage", value: 8 };

export function calculateRetailerPrice(input: PricingInput): PricingOutput {
  // Precedence: product > supplier > global
  let margin: MarginConfig;
  let source: "product" | "supplier" | "global";

  if (input.productMargin && input.productMargin.value > 0) {
    margin = input.productMargin;
    source = "product";
  } else if (input.supplierMargin && input.supplierMargin.value > 0) {
    margin = input.supplierMargin;
    source = "supplier";
  } else {
    margin = input.globalMargin ?? DEFAULT_MARGIN;
    source = "global";
  }

  let retailerPrice: number;
  if (margin.type === "percentage") {
    retailerPrice = Math.round(input.supplierPriceMinor * (1 + margin.value / 100));
  } else {
    retailerPrice = input.supplierPriceMinor + margin.value;
  }

  // Cap at MRP if available
  if (input.mrpMinor && retailerPrice > input.mrpMinor) {
    retailerPrice = input.mrpMinor;
  }

  return {
    retailerPriceMinor: retailerPrice,
    appliedMargin: margin,
    marginSource: source,
  };
}
