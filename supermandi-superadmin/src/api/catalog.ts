// SA-P2-006: Product Category Manual Override — API client
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;
import { getAuthHeaders, fetchWithTimeout } from "./authToken";
import { parseError } from "./errorSanitizer";

// =============================================================================
// Types
// =============================================================================

export type CategorySummary = {
  category: string;
  productCount: number;
};

export type CatalogProduct = {
  id: string;
  name: string;
  displayName: string;
  originalCategory: string | null;
  editedCategory: string | null;
  currentCategory: string | null;
  brand: string | null;
  barcode: string | null;
  supplierSku: string | null;
  purchasePrice: number;
  mrp: number | null;
  approvalStatus: string;
  supplierId: string;
  supplierName: string;
  createdAt: string;
  updatedAt: string;
  // SCALE-A1/A2: Compliance fields
  hsnCode?: string | null;
  defaultGstRate?: number | null;
  netContentValue?: number | null;
  netContentUnit?: string | null;
  manufacturerName?: string | null;
  countryOfOrigin?: string | null;
  shelfLifeDays?: number | null;
  // V3-FIX-169: Conversion/procurement metadata
  unit?: string | null;
  procurementUnit?: string | null;
  procurementPackQty?: number | null;
  baseStockUnit?: string | null;
  splitSellEligible?: boolean | null;
};

export type CatalogProductsResponse = {
  data: CatalogProduct[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
  filters: {
    search: string | null;
    category: string | null;
  };
};

export type CategoryOverrideResult = {
  data: {
    id: string;
    name: string;
    displayName: string;
    originalCategory: string | null;
    editedCategory: string | null;
    currentCategory: string | null;
  };
  change: {
    from: string | null;
    to: string | null;
    overrideCleared: boolean;
  };
};

// =============================================================================
// API Functions
// =============================================================================

/**
 * Fetch all unique categories with product counts.
 */
export async function fetchCategories(): Promise<CategorySummary[]> {
  const base = API_BASE;
  const res = await fetchWithTimeout(`${base}/api/v1/admin/catalog/categories`, {
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const json = await res.json();
  return json.data || [];
}

/**
 * Fetch paginated products with optional search and category filter.
 */
export async function fetchProducts(params?: {
  page?: number;
  limit?: number;
  q?: string;
  category?: string;
}): Promise<CatalogProductsResponse> {
  const base = API_BASE;
  const url = new URL(`${base}/api/v1/admin/catalog/products`, window.location.origin);

  if (params?.page) url.searchParams.set("page", String(params.page));
  if (params?.limit) url.searchParams.set("limit", String(params.limit));
  if (params?.q) url.searchParams.set("q", params.q);
  if (params?.category) url.searchParams.set("category", params.category);

  const res = await fetchWithTimeout(url.toString(), {
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const json = await res.json();
  return {
    data: json.data || [],
    pagination: json.pagination || { page: 1, limit: 50, total: 0, hasMore: false },
    filters: json.filters || { search: null, category: null },
  };
}

/**
 * Override a product's category (sets edited_category).
 * Pass null to clear the override and revert to original category.
 */
export async function overrideProductCategory(
  productId: string,
  category: string | null
): Promise<CategoryOverrideResult> {
  const base = API_BASE;
  const res = await fetchWithTimeout(
    `${base}/api/v1/admin/catalog/products/${encodeURIComponent(productId)}/category`,
    {
      method: "PATCH",
      headers: {
        ...getAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ category }),
    }
  );

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  const json = await res.json();
  return {
    data: json.data,
    change: json.change,
  };
}
