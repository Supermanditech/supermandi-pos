/**
 * V3-FIX-120: Canonical add-to-cart payload builder
 * Ensures all add entry points (tap, search, voice, scan) produce
 * the same CartItem shape with full metadata.
 */
import type { CartItem } from "../stores/cartStore";
import type { Product } from "../stores/productsStore";

/**
 * Build a canonical CartItem from any product source.
 * All add-to-cart paths MUST use this instead of inline object construction.
 */
export function buildCartItem(product: Product, overrides?: Partial<CartItem>): CartItem {
  return {
    id: product.barcode ?? product.id,
    name: product.name,
    priceMinor: product.priceMinor,
    currency: product.currency ?? "INR",
    quantity: 1,
    barcode: product.barcode,
    sku: (product as any).sku,
    mrpMinor: product.mrpMinor,
    gstPct: product.gstRate,
    hsnCode: product.hsnCode,
    unitLabel: product.unit,
    caseSize: (product as any).caseSize,
    supplierName: product.supplierName,
    metadata: {
      storeProductId: product.storeProductId,
      brand: product.brand,
      category: product.category,
      imageUrl: product.imageUrl,
    },
    ...overrides,
  };
}

/**
 * Build a CartItem from a search result (lighter shape).
 */
export function buildCartItemFromSearch(result: {
  id: string;
  name: string;
  priceMinor: number;
  barcode?: string;
  brand?: string;
  stock?: number;
}): CartItem {
  return {
    id: result.barcode ?? result.id,
    name: result.name,
    priceMinor: result.priceMinor,
    currency: "INR",
    quantity: 1,
    barcode: result.barcode,
    metadata: { brand: result.brand },
  };
}
