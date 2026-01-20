import { authFetch } from '../lib/api';

const API_BASE = '/api/v1/retailer-admin';

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

  return response.json();
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

  return response.json();
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

export async function fetchInventory(accessToken: string): Promise<ApiResponse<InventoryItem[]>> {
  const response = await authFetch(`${API_BASE}/inventory`, accessToken);

  // 401 handled by authFetch (triggers logout)
  if (response.status === 401) {
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    throw new Error('Failed to fetch inventory');
  }

  return response.json();
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

  return response.json();
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
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to create supplier');
  }

  return response.json();
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
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to update supplier');
  }

  return response.json();
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
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to delete supplier');
  }

  return response.json();
}

export async function fetchDailySummary(accessToken: string, date?: string): Promise<ApiResponse<DailySummary>> {
  const path = date ? `${API_BASE}/daily-summary?date=${date}` : `${API_BASE}/daily-summary`;
  const response = await authFetch(path, accessToken);

  // 401 handled by authFetch (triggers logout)
  if (response.status === 401) {
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    throw new Error('Failed to fetch daily summary');
  }

  return response.json();
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

  return response.json();
}
