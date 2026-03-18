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
 * Build a CartItem from a search result.
 * Preserves all available metadata from the search response so that
 * search-added items carry the same fields as tap/scan-added items.
 */
export function buildCartItemFromSearch(result: {
  id: string;
  name: string;
  priceMinor: number;
  barcode?: string;
  brand?: string;
  stock?: number;
  gstRate?: number;
  hsnCode?: string;
  unit?: string;
  caseSize?: number;
  storeProductId?: string;
  category?: string;
  imageUrl?: string;
  supplierName?: string;
  mrpMinor?: number;
}): CartItem {
  return {
    id: result.barcode ?? result.id,
    name: result.name,
    priceMinor: result.priceMinor,
    currency: "INR",
    quantity: 1,
    barcode: result.barcode,
    mrpMinor: result.mrpMinor,
    gstPct: result.gstRate,
    hsnCode: result.hsnCode,
    unitLabel: result.unit,
    caseSize: result.caseSize,
    supplierName: result.supplierName,
    metadata: {
      storeProductId: result.storeProductId,
      brand: result.brand,
      category: result.category,
      imageUrl: result.imageUrl,
    },
  };
}

/**
 * Build a CartItem from a ProductTileData (tap path).
 * Ensures tile taps use the same canonical contract as scan/search/voice.
 */
export function buildCartItemFromTile(tile: {
  id: string;
  name: string;
  priceMrpMinor: number;
  priceTradeMinor?: number;
  barcode?: string;
  brand?: string;
  caseSize?: number;
  unit?: string;
  category?: string;
  imageUrl?: string;
}, sellMode: "retail" | "bulk"): CartItem {
  const price = sellMode === "bulk" && tile.priceTradeMinor
    ? tile.priceTradeMinor
    : tile.priceMrpMinor;
  return {
    id: tile.barcode ?? tile.id,
    name: tile.name,
    priceMinor: price,
    currency: "INR",
    quantity: 1,
    barcode: tile.barcode,
    unitLabel: tile.unit,
    caseSize: tile.caseSize,
    metadata: {
      brand: tile.brand,
      category: tile.category,
      imageUrl: tile.imageUrl,
      sellMode,
    },
  };
}

/**
 * Build a CartItem from a voice match result.
 * Voice results carry product name + quantity; we look up full product
 * data from the products store when available.
 */
export function buildCartItemFromVoice(product: Product, quantity: number): CartItem {
  return {
    ...buildCartItem(product),
    quantity,
  };
}
