import { apiClient } from "./apiClient";

type ApiProductInventory = {
  selling_price?: number | null;
};

type ApiProductVariant = {
  selling_price?: number | null;
  mrp?: number | null;
};

export type ApiProduct = {
  id: string;
  name: string;
  barcode: string | null;
  sku: string | null;
  price: number; // minor units
  currency: string;
  stock: number;
  inventory?: ApiProductInventory | null;
  variant?: ApiProductVariant | null;
};

export async function listProducts(params?: { barcode?: string; q?: string }): Promise<ApiProduct[]> {
  const query = new URLSearchParams();
  if (params?.barcode) query.set("barcode", params.barcode);
  if (params?.q) query.set("q", params.q);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const res = await apiClient.get<{ products: ApiProduct[] }>(`/api/products${suffix}`);
  return res.products;
}

export function resolveProductPriceMinor(product: ApiProduct): number {
  const rawPrice =
    product.inventory?.selling_price ??
    product.variant?.selling_price ??
    product.variant?.mrp ??
    product.price ??
    0;

  if (!Number.isFinite(rawPrice)) return 0;
  return Math.max(0, Math.round(rawPrice));
}

