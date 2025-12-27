import { apiClient } from "./apiClient";

export type ApiProduct = {
  id: string;
  name: string;
  barcode: string | null;
  sku: string | null;
  price: number; // minor units
  currency: string;
  stock: number;
};

export async function listProducts(params?: { barcode?: string; q?: string }): Promise<ApiProduct[]> {
  const query = new URLSearchParams();
  if (params?.barcode) query.set("barcode", params.barcode);
  if (params?.q) query.set("q", params.q);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const res = await apiClient.get<{ products: ApiProduct[] }>(`/api/products${suffix}`);
  return res.products;
}

