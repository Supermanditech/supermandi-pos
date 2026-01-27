// SM-023: API client for supplier portal
const API_BASE_URL = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Get stored auth token
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('supplier_token');
}

// Set auth token
export function setAuthToken(token: string): void {
  localStorage.setItem('supplier_token', token);
}

// Clear auth token
export function clearAuthToken(): void {
  localStorage.removeItem('supplier_token');
}

// Authenticated fetch wrapper
export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      response.status,
      data.error?.code || 'UNKNOWN',
      data.error?.message || 'Request failed'
    );
  }

  return data.data ?? data;
}

// ============================================================================
// AUTH APIs (SM-005)
// ============================================================================

export interface RegisterInput {
  email: string;
  password: string;
  businessName: string;
  gstin?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface Supplier {
  id: string;
  email: string;
  businessName: string;
  gstin?: string;
  phone?: string;
  contactName?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  verificationStatus: 'pending' | 'verified' | 'rejected';
  bankDetails?: {
    accountName?: string;
    accountNumber?: string;
    ifscCode?: string;
    bankName?: string;
  };
}

export interface AuthResponse {
  token: string;
  supplier: Supplier;
}

export async function registerSupplier(input: RegisterInput): Promise<AuthResponse> {
  const result = await apiFetch<AuthResponse>('/api/v1/supplier/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  setAuthToken(result.token);
  return result;
}

export async function loginSupplier(input: LoginInput): Promise<AuthResponse> {
  const result = await apiFetch<AuthResponse>('/api/v1/supplier/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  setAuthToken(result.token);
  return result;
}

export async function getSupplierProfile(): Promise<Supplier> {
  return apiFetch<Supplier>('/api/v1/supplier/profile');
}

export async function updateSupplierProfile(data: Partial<Supplier>): Promise<Supplier> {
  return apiFetch<Supplier>('/api/v1/supplier/profile', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function changePassword(data: { currentPassword: string; newPassword: string }): Promise<void> {
  await apiFetch<void>('/api/v1/supplier/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ============================================================================
// PRODUCTS APIs (SM-006)
// ============================================================================

export interface Product {
  id: string;
  name: string;
  description?: string;
  category?: string;
  barcode?: string;
  supplierSku?: string;
  purchasePrice: number; // in paise
  mrp?: number; // in paise
  moq: number;
  unit: string;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export interface ProductInput {
  name: string;
  description?: string;
  category?: string;
  barcode?: string;
  supplierSku?: string;
  purchasePrice: number; // in paise
  mrp?: number; // in paise
  moq?: number;
  unit?: string;
}

export async function getProducts(): Promise<Product[]> {
  return apiFetch<Product[]>('/api/v1/supplier/products');
}

export async function createProduct(input: ProductInput): Promise<Product> {
  return apiFetch<Product>('/api/v1/supplier/products', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateProduct(id: string, input: Partial<ProductInput>): Promise<Product> {
  return apiFetch<Product>(`/api/v1/supplier/products/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteProduct(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/supplier/products/${id}`, {
    method: 'DELETE',
  });
}

// ============================================================================
// ORDERS APIs
// ============================================================================

export interface Order {
  id: string;
  storeId: string;
  storeName: string;
  items: {
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }[];
  totalAmount: number;
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
  createdAt: string;
}

export async function getOrders(): Promise<Order[]> {
  return apiFetch<Order[]>('/api/v1/supplier/orders');
}

export async function updateOrderStatus(id: string, status: Order['status']): Promise<Order> {
  return apiFetch<Order>(`/api/v1/supplier/orders/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

// ============================================================================
// DASHBOARD APIs
// ============================================================================

export interface DashboardStats {
  totalProducts: number;
  pendingProducts: number;
  approvedProducts: number;
  totalOrders: number;
  pendingOrders: number;
  totalRevenue: number; // in paise
}

export async function getDashboardStats(): Promise<DashboardStats> {
  return apiFetch<DashboardStats>('/api/v1/supplier/dashboard/stats');
}

// ============================================================================
// CSV UPLOAD APIs (SM-007)
// ============================================================================

export interface CsvUploadResult {
  totalRows: number;
  imported: number;
  skipped: number;
  errors: { row: number; error: string }[];
}

export async function uploadProductsCsv(file: File): Promise<CsvUploadResult> {
  const formData = new FormData();
  formData.append('file', file);

  const token = getAuthToken();
  const response = await fetch(`${API_BASE_URL}/api/v1/supplier/products/csv-upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new ApiError(response.status, data.error?.code || 'UNKNOWN', data.error?.message || 'Upload failed');
  }
  return data.data;
}
