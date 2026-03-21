/**
 * V3-FIX-141: SuperAdmin catalogue commercialization service
 *
 * Governs the conversion of approved supplier SKUs into SuperMandi
 * principal-sale catalogue entries.
 *
 * Billing models:
 * - SUPERMANDI_PRINCIPAL: SuperMandi buys from supplier, sells to retailer
 *   - Supplier → SuperMandi invoice
 *   - SuperMandi → Retailer tax invoice
 *   - Margin controlled by SuperAdmin
 *
 * Publish controls:
 * - publish_target: "all_stores" | "region" | "specific_stores"
 * - supplier_visible: whether supplier identity is shown to retailer
 * - margin_mode: "percentage" | "fixed" | "both"
 * - margin_basis: "per_unit" | "per_pack" | "per_case"
 */

export type BillingModel = "SUPERMANDI_PRINCIPAL" | "DIRECT_SUPPLIER";

export type PublishTarget = "all_stores" | "region" | "specific_stores";

export type MarginMode = "percentage" | "fixed" | "both";

export type MarginBasis = "per_unit" | "per_pack" | "per_case";

export interface CommercializationConfig {
  billingModel: BillingModel;
  supplierVisible: boolean;
  marginMode: MarginMode;
  marginBasis: MarginBasis;
  marginPct?: number;
  marginFixedMinor?: number;
  publishTarget: PublishTarget;
  publishRegions?: string[];
  publishStoreIds?: string[];
}

/**
 * Default commercialization config for SuperMandi principal model.
 */
export const DEFAULT_COMMERCIALIZATION: CommercializationConfig = {
  billingModel: "SUPERMANDI_PRINCIPAL",
  supplierVisible: false,
  marginMode: "percentage",
  marginBasis: "per_unit",
  marginPct: 15,
  publishTarget: "all_stores",
};

/**
 * Validate a commercialization config before applying.
 */
export function validateCommercialization(config: Partial<CommercializationConfig>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (config.billingModel && !["SUPERMANDI_PRINCIPAL", "DIRECT_SUPPLIER"].includes(config.billingModel)) {
    errors.push(`Invalid billing model: ${config.billingModel}. Must be SUPERMANDI_PRINCIPAL or DIRECT_SUPPLIER.`);
  }

  if (config.marginPct !== undefined && (config.marginPct < 0 || config.marginPct > 100)) {
    errors.push("Margin percentage must be between 0 and 100");
  }

  if (config.marginFixedMinor !== undefined && config.marginFixedMinor < 0) {
    errors.push("Fixed margin must be non-negative");
  }

  if (config.publishTarget === "specific_stores" && (!config.publishStoreIds || config.publishStoreIds.length === 0)) {
    errors.push("Specific stores target requires at least one store ID");
  }

  if (config.publishTarget === "region" && (!config.publishRegions || config.publishRegions.length === 0)) {
    errors.push("Region target requires at least one region");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Calculate the retail price from supplier base price + margin config.
 */
export function calculateRetailPrice(
  supplierPriceMinor: number,
  config: CommercializationConfig
): number {
  if (config.marginMode === "percentage" && config.marginPct !== undefined) {
    return Math.round(supplierPriceMinor * (1 + config.marginPct / 100));
  }
  if (config.marginMode === "fixed" && config.marginFixedMinor !== undefined) {
    return supplierPriceMinor + config.marginFixedMinor;
  }
  if (config.marginMode === "both" && config.marginPct !== undefined && config.marginFixedMinor !== undefined) {
    return Math.round(supplierPriceMinor * (1 + config.marginPct / 100)) + config.marginFixedMinor;
  }
  // Default: 15% margin
  return Math.round(supplierPriceMinor * 1.15);
}
