import { authFetch, safeJson } from '../lib/api';

// DEPLOY-003: Use VITE_API_BASE_URL when set (points to gateway e.g. http://localhost:3000)
// Falls back to relative path (requires Nginx proxy for /api/* in production)
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '') + '/api/v1/retailer-admin';

interface Store {
  id: string;
  code: string;
  name: string;
  address?: string;
  phone?: string;
  status?: string;
}

export interface DailySummary {
  date: string;
  totalSales: number;
  totalBills: number;
  averageBillValue: number;
  paymentBreakdown: {
    cash: number;
    upi: number;
    card: number;
    credit: number;
  };
  itemsSold: number;
  topSellingItems: Array<{
    productId: string;
    productName: string;
    quantitySold: number;
    totalAmount: number;
  }>;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export async function fetchStore(accessToken: string): Promise<ApiResponse<Store>> {
  const response = await authFetch(`${API_BASE}/store`, accessToken);

  // 401 handled by authFetch (triggers logout)
  if (response.status === 401) {
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    throw new Error('Failed to fetch store');
  }

  // GO-LIVE-020: Use safe JSON parsing
  const data = await safeJson<ApiResponse<Store>>(response);
  if (!data) throw new Error('Invalid response from server');
  return data;
}

export async function fetchProducts(accessToken: string): Promise<ApiResponse<unknown[]>> {
  const response = await authFetch(`${API_BASE}/products`, accessToken);

  // 401 handled by authFetch (triggers logout)
  if (response.status === 401) {
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    throw new Error('Failed to fetch products');
  }

  // GO-LIVE-020: Use safe JSON parsing
  const data = await safeJson<ApiResponse<unknown[]>>(response);
  if (!data) throw new Error('Invalid response from server');
  return data;
}

// Inventory item for dashboard display
export interface InventoryItem {
  productId: string;
  productName: string;
  barcode?: string | null;
  totalStockQty: number;
  totalPurchaseValue: number;  // paise
  totalSellRevenue: number;    // paise
}

// TYPE-CLEAN-001: Typed inventory response (removes `as any` in DashboardPage)
export interface InventoryResponse extends ApiResponse<InventoryItem[]> {
  totals?: { totalProducts: number; totalStockQty: number; totalPurchaseValue: number; totalSellRevenue: number };
}

export async function fetchInventory(accessToken: string): Promise<InventoryResponse> {
  const response = await authFetch(`${API_BASE}/inventory`, accessToken);

  // 401 handled by authFetch (triggers logout)
  if (response.status === 401) {
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    throw new Error('Failed to fetch inventory');
  }

  // GO-LIVE-020: Use safe JSON parsing
  const data = await safeJson<InventoryResponse>(response);
  if (!data) throw new Error('Invalid response from server');
  return data;
}

// GL-RJ-009: Fetch daily sales summary for dashboard
export async function fetchDailySummary(accessToken: string, date?: string): Promise<ApiResponse<DailySummary>> {
  const params = date ? `?date=${date}` : '';
  const response = await authFetch(`${API_BASE}/daily-summary${params}`, accessToken);

  if (response.status === 401) {
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    throw new Error('Failed to fetch daily summary');
  }

  // GO-LIVE-020: Use safe JSON parsing
  const data = await safeJson<ApiResponse<DailySummary>>(response);
  if (!data) throw new Error('Invalid response from server');
  return data;
}

// T-212: Sales analytics with date range
export interface SalesAnalytics {
  from: string;
  to: string;
  totals: {
    totalSales: number;
    totalBills: number;
    averageBillValue: number;
  };
  paymentBreakdown: {
    cash: number;
    upi: number;
    credit: number;
  };
  daily: Array<{
    date: string;
    bills: number;
    totalSales: number;
    cash: number;
    upi: number;
    credit: number;
  }>;
  topProducts: Array<{
    productId: string;
    productName: string;
    qtySold: number;
    totalAmount: number;
  }>;
}

export async function fetchSalesAnalytics(accessToken: string, from?: string, to?: string): Promise<ApiResponse<SalesAnalytics>> {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  const response = await authFetch(`${API_BASE}/analytics/sales${qs ? `?${qs}` : ''}`, accessToken);

  if (response.status === 401) throw new Error('Unauthorized');
  if (!response.ok) throw new Error('Failed to fetch analytics');

  const data = await safeJson<ApiResponse<SalesAnalytics>>(response);
  if (!data) throw new Error('Invalid response from server');
  return data;
}

// PRA-007: Product analytics with category breakdown
export interface CategorySalesGroup {
  group: string;
  total_minor: number;
  quantity: number;
}

export interface ProductAnalytics {
  from: string;
  to: string;
  groupBy: 'category' | 'day' | 'hour';
  salesByGroup: CategorySalesGroup[];
  topProducts: Array<{
    productId: string;
    productName: string;
    category: string | null;
    qtySold: number;
    totalAmount: number;
  }>;
  newProductsCount: number;
  missingFields: string[];
}

export async function fetchProductAnalytics(
  accessToken: string,
  from?: string,
  to?: string,
  groupBy: string = 'category'
): Promise<ApiResponse<ProductAnalytics>> {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  params.set('groupBy', groupBy);
  const qs = params.toString();
  const response = await authFetch(`${API_BASE}/analytics/products?${qs}`, accessToken);

  if (response.status === 401) throw new Error('Unauthorized');
  if (!response.ok) throw new Error('Failed to fetch product analytics');

  const data = await safeJson<ApiResponse<ProductAnalytics>>(response);
  if (!data) throw new Error('Invalid response from server');
  return data;
}

// FE-RETAILER-CAT-001: Categories from FMCG taxonomy
export interface FmcgCategory {
  id: string;
  labelEn: string;
  labelHi: string | null;
  iconKey: string;
  sortOrder: number;
  productCount: number;
  stockValue: number;  // paise
  isHidden?: boolean;  // RCAT-CAT-002: Store override - hidden for this store
}

export async function fetchCategories(accessToken: string): Promise<ApiResponse<FmcgCategory[]>> {
  const response = await authFetch(`${API_BASE}/categories`, accessToken);

  if (response.status === 401) {
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    throw new Error('Failed to fetch categories');
  }

  // GO-LIVE-020: Use safe JSON parsing
  const data = await safeJson<ApiResponse<FmcgCategory[]>>(response);
  if (!data) throw new Error('Invalid response from server');
  return data;
}

// Full 4-section supplier interface matching backend
export interface Supplier {
  id: string;
  // Section A: Identity & Compliance
  businessName: string;
  tradeName?: string | null;
  supplierType?: string | null;
  gstin?: string | null;
  pan?: string | null;
  fssai?: string | null;
  // Section B: Contact & Address
  primaryPhone?: string | null;
  whatsappEnabled?: boolean;
  secondaryPhone?: string | null;
  email?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  area?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  // Section C: Commercial Terms
  paymentTerms?: string | null;
  creditDays?: number;
  minOrderValue?: number;
  deliveryCharges?: number;
  deliverySchedule?: string | null;
  returnsAllowed?: boolean;
  returnsWindow?: number;
  taxInvoiceProvided?: boolean;
  priceSource?: string | null;
  serviceArea?: string | null;
  deliveryAddress?: string | null;
  // Section D: Operational Metadata
  categoriesSupplied?: string[];
  brandsSupplied?: string | null;
  orderingChannel?: string | null;
  notes?: string | null;
  // Status & metadata
  verificationStatus: string;
  isSupermandi: boolean;
  supplierCode?: string | null;
  // Legacy fields
  name: string;
  phone?: string | null;
  address?: string | null;
}

export interface SupplierFormData {
  // Section A: Identity & Compliance
  supplierType?: string;
  businessName: string;
  tradeName?: string;
  gstin?: string;
  pan?: string;
  fssai?: string;
  // Section B: Contact & Address
  primaryPhone?: string;
  whatsappEnabled?: boolean;
  secondaryPhone?: string;
  email?: string;
  addressLine1?: string;
  addressLine2?: string;
  area?: string;
  city?: string;
  state?: string;
  pincode?: string;
  // Section C: Commercial Terms
  paymentTerms?: string;
  creditDays?: number | string;
  minOrderValue?: number | string;
  deliveryCharges?: number | string;
  deliverySchedule?: string;
  returnsAllowed?: boolean;
  returnsWindow?: number | string;
  taxInvoiceProvided?: boolean;
  priceSource?: string;
  serviceArea?: string;
  deliveryAddress?: string;
  // Section D: Operational Metadata
  categoriesSupplied?: string[];
  brandsSupplied?: string;
  orderingChannel?: string;
  notes?: string;
}

export async function fetchSuppliers(accessToken: string): Promise<ApiResponse<Supplier[]>> {
  const response = await authFetch(`${API_BASE}/suppliers`, accessToken);

  // 401 handled by authFetch (triggers logout)
  if (response.status === 401) {
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    throw new Error('Failed to fetch suppliers');
  }

  // ISSUE-MICRO-015: Use safe JSON parsing (was bare response.json())
  const data = await safeJson<ApiResponse<Supplier[]>>(response);
  if (!data) throw new Error('Invalid response from server');
  return data;
}

export async function createSupplier(accessToken: string, data: SupplierFormData): Promise<ApiResponse<{ id: string }>> {
  const response = await authFetch(`${API_BASE}/suppliers`, accessToken, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  // 401 handled by authFetch (triggers logout)
  if (response.status === 401) {
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    const error = await safeJson(response).catch(() => ({})) as Record<string, string>;
    throw new Error(error.message || 'Failed to create supplier');
  }

  // AUDIT-RET-041: Use safeJson instead of bare response.json()
  const result = await safeJson<ApiResponse<{ id: string }>>(response);
  if (!result) throw new Error('Invalid response from server');
  return result;
}

export async function updateSupplier(accessToken: string, id: string, data: Partial<SupplierFormData>): Promise<ApiResponse<{ id: string }>> {
  const response = await authFetch(`${API_BASE}/suppliers/${id}`, accessToken, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  // 401 handled by authFetch (triggers logout)
  if (response.status === 401) {
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    const error = await safeJson(response).catch(() => ({})) as Record<string, string>;
    throw new Error(error.message || 'Failed to update supplier');
  }

  // AUDIT-RET-041: Use safeJson instead of bare response.json()
  const result = await safeJson<ApiResponse<{ id: string }>>(response);
  if (!result) throw new Error('Invalid response from server');
  return result;
}

export async function deleteSupplier(accessToken: string, id: string): Promise<ApiResponse<{ success: boolean }>> {
  const response = await authFetch(`${API_BASE}/suppliers/${id}`, accessToken, {
    method: 'DELETE',
  });

  // 401 handled by authFetch (triggers logout)
  if (response.status === 401) {
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    const error = await safeJson(response).catch(() => ({})) as Record<string, string>;
    throw new Error(error.message || 'Failed to delete supplier');
  }

  // AUDIT-RET-041: Use safeJson instead of bare response.json()
  const result = await safeJson<ApiResponse<{ success: boolean }>>(response);
  if (!result) throw new Error('Invalid response from server');
  return result;
}

// RCAT-SEARCH-001: Unified search results
export interface SearchResult {
  products: {
    id: string;
    productId: string;
    name: string;
    brand: string | null;
    barcode: string | null;
    mode: string;
    sellPrice: number;
    stock: number;
  }[];
  suppliers: {
    id: string;
    businessName: string;
    phone: string | null;
    gstin: string | null;
    verificationStatus: string;
    isSupermandi: boolean;
  }[];
  barcodes: {
    storeProductId: string;
    productId: string;
    productName: string;
    manufacturerBarcode: string | null;
    storeBarcode: string | null;
    mode: string;
    sellPrice: number;
    barcode: string;
  }[];
}

export async function fetchSearch(accessToken: string, query: string, limit = 10): Promise<ApiResponse<SearchResult>> {
  const response = await authFetch(
    `${API_BASE}/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    accessToken
  );

  if (response.status === 401) {
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    throw new Error('Search failed');
  }

  // AUDIT-RET-041: Use safeJson instead of bare response.json()
  const data = await safeJson<ApiResponse<SearchResult>>(response);
  if (!data) throw new Error('Invalid response from server');
  return data;
}

export async function fetchCompliance(accessToken: string): Promise<ApiResponse<unknown[]>> {
  const response = await authFetch(`${API_BASE}/compliance`, accessToken);

  // 401 handled by authFetch (triggers logout)
  if (response.status === 401) {
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    throw new Error('Failed to fetch compliance documents');
  }

  // AUDIT-RET-041: Use safeJson instead of bare response.json()
  const data = await safeJson<ApiResponse<unknown[]>>(response);
  if (!data) throw new Error('Invalid response from server');
  return data;
}

// SA-P1-011: Stock adjustment audit history
export interface StockAdjustment {
  id: string;
  productId: string;
  productName: string;
  oldQty: number;
  newQty: number;
  reason: string | null;
  adjustedBy: string | null;
  adjustedAt: string;
  notes: string | null;
  referenceType: string | null;
}

export interface StockAdjustmentsResponse {
  success: boolean;
  adjustments: StockAdjustment[];
  total: number;
  page: number;
  limit: number;
}

export async function fetchStockAdjustments(
  accessToken: string,
  params?: {
    from?: string;
    to?: string;
    productId?: string;
    reason?: string;
    page?: number;
    limit?: number;
  }
): Promise<StockAdjustmentsResponse> {
  const qs = new URLSearchParams();
  if (params?.from) qs.set('from', params.from);
  if (params?.to) qs.set('to', params.to);
  if (params?.productId) qs.set('productId', params.productId);
  if (params?.reason) qs.set('reason', params.reason);
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));

  const queryString = qs.toString();
  const response = await authFetch(
    `${API_BASE}/store/stock-adjustments${queryString ? `?${queryString}` : ''}`,
    accessToken
  );

  if (response.status === 401) throw new Error('Unauthorized');
  if (!response.ok) throw new Error('Failed to fetch stock adjustments');

  const data = await safeJson<StockAdjustmentsResponse>(response);
  if (!data) throw new Error('Invalid response from server');
  return data;
}
