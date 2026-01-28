// SM-023: API client for supplier portal
// GL-WF-009: Removed localhost fallback - API URL must be configured in production
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_BASE_URL;

if (!API_BASE_URL && typeof window !== 'undefined') {
  console.error('CRITICAL: API_BASE_URL is not configured. Set NEXT_PUBLIC_API_BASE_URL environment variable.');
}

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

// GL-WF-046: Handle 401 responses by redirecting to login
// GL-CRIT-0064: Use async cleanup with replace() instead of synchronous href
function handle401Response(): void {
  if (typeof window !== 'undefined') {
    clearAuthToken();
    // Use replace to prevent back button returning to protected page
    // Use setTimeout to ensure token is cleared before redirect
    setTimeout(() => {
      window.location.replace('/login');
    }, 0);
  }
}

// Authenticated fetch wrapper
export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  // GL-WF-009: Fail explicitly if API URL not configured
  if (!API_BASE_URL) {
    throw new ApiError(500, 'CONFIG_ERROR', 'API URL is not configured. Contact administrator.');
  }

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

  // GL-WF-046: Handle 401 (unauthorized) responses
  if (response.status === 401) {
    const data = await response.json().catch(() => ({}));
    // Only redirect for token issues, not login attempts
    if (endpoint !== '/api/v1/supplier/auth/login' && endpoint !== '/api/v1/supplier/auth/register') {
      handle401Response();
    }
    throw new ApiError(401, data.error?.code || 'UNAUTHORIZED', data.error?.message || 'Session expired. Please login again.');
  }

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
  emailVerified?: boolean; // GL-WF-034: Email verification status
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

// GL-WF-035: Password reset functions
export async function requestPasswordReset(email: string): Promise<{ success: boolean; message: string; devToken?: string }> {
  return apiFetch<{ success: boolean; message: string; devToken?: string }>('/api/v1/supplier/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(email: string, token: string, newPassword: string): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>('/api/v1/supplier/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ email, token, newPassword }),
  });
}

// GL-WF-034: Email verification functions
export async function sendVerificationEmail(): Promise<{ success: boolean; message: string; devCode?: string }> {
  return apiFetch<{ success: boolean; message: string; devCode?: string }>('/api/v1/supplier/auth/send-verification', {
    method: 'POST',
  });
}

export async function verifyEmail(code: string): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>('/api/v1/supplier/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export async function getEmailVerificationStatus(): Promise<{ emailVerified: boolean }> {
  return apiFetch<{ emailVerified: boolean }>('/api/v1/supplier/auth/verification-status');
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
  rejectionReason?: string; // GL-WF-036: Rejection reason from admin
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

// GL-WF-063: Pagination types
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export async function getProducts(params: PaginationParams = {}): Promise<PaginatedResponse<Product>> {
  const queryParams = new URLSearchParams();
  if (params.page) queryParams.set('page', params.page.toString());
  if (params.limit) queryParams.set('limit', params.limit.toString());
  const queryString = queryParams.toString();
  const url = `/api/v1/supplier/products${queryString ? `?${queryString}` : ''}`;
  return apiFetch<PaginatedResponse<Product>>(url);
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

// GL-WF-038: Order item with per-item status tracking
export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  receivedQuantity: number;
  unitPrice: number;
  total: number;
  status: 'pending' | 'partial' | 'received' | 'rejected';
}

export interface Order {
  id: string;
  storeId: string;
  storeName: string;
  items: OrderItem[];
  totalAmount: number;
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
  createdAt: string;
}

// GL-WF-063: Paginated orders
export async function getOrders(params: PaginationParams = {}): Promise<PaginatedResponse<Order>> {
  const queryParams = new URLSearchParams();
  if (params.page) queryParams.set('page', params.page.toString());
  if (params.limit) queryParams.set('limit', params.limit.toString());
  const queryString = queryParams.toString();
  const url = `/api/v1/supplier/orders${queryString ? `?${queryString}` : ''}`;
  return apiFetch<PaginatedResponse<Order>>(url);
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

// GL-WF-059: Maximum file size for CSV upload (10MB)
const MAX_CSV_FILE_SIZE = 10 * 1024 * 1024;

export async function uploadProductsCsv(file: File): Promise<CsvUploadResult> {
  // GL-WF-009: Fail explicitly if API URL not configured
  if (!API_BASE_URL) {
    throw new ApiError(500, 'CONFIG_ERROR', 'API URL is not configured. Contact administrator.');
  }

  // GL-WF-059: Enforce file size limit
  if (file.size > MAX_CSV_FILE_SIZE) {
    throw new ApiError(400, 'FILE_TOO_LARGE', `File size exceeds maximum allowed (${MAX_CSV_FILE_SIZE / 1024 / 1024}MB)`);
  }

  const formData = new FormData();
  formData.append('file', file);

  const token = getAuthToken();
  const response = await fetch(`${API_BASE_URL}/api/v1/supplier/products/csv-upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  // GL-WF-046: Handle 401 responses
  if (response.status === 401) {
    handle401Response();
    throw new ApiError(401, 'UNAUTHORIZED', 'Session expired. Please login again.');
  }

  const data = await response.json();
  if (!response.ok) {
    throw new ApiError(response.status, data.error?.code || 'UNKNOWN', data.error?.message || 'Upload failed');
  }
  return data.data;
}

// ============================================================================
// GL-WF-008, GL-WF-018: KYC APIs
// ============================================================================

export interface IFSCLookupResult {
  valid: boolean;
  bankName: string;
  branchName: string;
  address: string;
  city: string;
  state: string;
  ifsc: string;
}

export interface BankVerificationResult {
  verified: boolean;
  bankName: string;
  branchName: string;
  verificationRef: string;
  message: string;
}

export interface KycDocument {
  id: string;
  documentType: 'pan_card' | 'gstin_certificate' | 'address_proof' | 'cancelled_cheque' | 'business_license';
  fileName: string;
  fileSize: number;
  mimeType: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KycStatus {
  payoutReady: boolean;
  requirements: {
    emailVerified: boolean;
    profileVerified: boolean;
    bankVerified: boolean;
    hasBankDetails: boolean;
    hasGstin: boolean;
    panCardApproved: boolean;
    gstinCertApproved: boolean;
    cancelledChequeApproved: boolean;
  };
  documents: Record<string, string>;
  message: string;
}

// GL-WF-008: Verify IFSC code and get bank details
export async function verifyIFSC(ifscCode: string): Promise<IFSCLookupResult> {
  return apiFetch<IFSCLookupResult>('/api/v1/supplier/kyc/verify-ifsc', {
    method: 'POST',
    body: JSON.stringify({ ifscCode }),
  });
}

// GL-WF-008: Verify and save bank account details
export async function verifyBankAccount(data: {
  accountNumber: string;
  ifscCode: string;
  accountName: string;
}): Promise<BankVerificationResult> {
  return apiFetch<BankVerificationResult>('/api/v1/supplier/kyc/verify-bank', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// GL-WF-018: Get all KYC documents
export async function getKycDocuments(): Promise<KycDocument[]> {
  return apiFetch<KycDocument[]>('/api/v1/supplier/kyc/documents');
}

// GL-WF-018: Upload KYC document
export async function uploadKycDocument(
  type: KycDocument['documentType'],
  file: File
): Promise<KycDocument & { message: string }> {
  if (!API_BASE_URL) {
    throw new ApiError(500, 'CONFIG_ERROR', 'API URL is not configured. Contact administrator.');
  }

  // Max 5MB per document
  if (file.size > 5 * 1024 * 1024) {
    throw new ApiError(400, 'FILE_TOO_LARGE', 'File size exceeds maximum allowed (5MB)');
  }

  const formData = new FormData();
  formData.append('document', file);

  const token = getAuthToken();
  const response = await fetch(`${API_BASE_URL}/api/v1/supplier/kyc/documents/${type}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  if (response.status === 401) {
    handle401Response();
    throw new ApiError(401, 'UNAUTHORIZED', 'Session expired. Please login again.');
  }

  const data = await response.json();
  if (!response.ok) {
    throw new ApiError(response.status, data.error?.code || 'UNKNOWN', data.error?.message || 'Upload failed');
  }
  return data.data;
}

// GL-WF-018: Delete KYC document
export async function deleteKycDocument(id: string): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>(`/api/v1/supplier/kyc/documents/${id}`, {
    method: 'DELETE',
  });
}

// GL-WF-043: Get KYC/payout readiness status
export async function getKycStatus(): Promise<KycStatus> {
  return apiFetch<KycStatus>('/api/v1/supplier/kyc/status');
}

// ============================================================================
// GL-WF-044: PAYOUTS APIs
// ============================================================================

export interface Payout {
  id: string;
  amountPaise: number;
  currency: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  bankAccount: {
    accountNumber: string;
    ifsc: string;
    accountName: string;
  };
  referenceId: string;
  paymentGatewayRef?: string;
  failureReason?: string;
  initiatedAt: string;
  completedAt?: string;
  createdAt: string;
}

export interface PayoutSummary {
  totalRevenuePaise: number;
  totalPaidPaise: number;
  totalPendingPaise: number;
  totalProcessingPaise: number;
  availableBalancePaise: number;
  completedPayouts: number;
  pendingPayouts: number;
}

// GL-WF-044: Get payout history with pagination
export async function getPayouts(params: PaginationParams = {}): Promise<PaginatedResponse<Payout>> {
  const queryParams = new URLSearchParams();
  if (params.page) queryParams.set('page', params.page.toString());
  if (params.limit) queryParams.set('limit', params.limit.toString());
  const queryString = queryParams.toString();
  const url = `/api/v1/supplier/payouts${queryString ? `?${queryString}` : ''}`;
  return apiFetch<PaginatedResponse<Payout>>(url);
}

// GL-WF-044: Get payout summary (total earnings, pending, paid)
export async function getPayoutSummary(): Promise<PayoutSummary> {
  return apiFetch<PayoutSummary>('/api/v1/supplier/payouts/summary');
}

// GL-WF-044: Get single payout details
export async function getPayoutById(id: string): Promise<Payout> {
  return apiFetch<Payout>(`/api/v1/supplier/payouts/${id}`);
}

// ============================================================================
// GL-WF-039: ORDER SHIPMENT APIs
// ============================================================================

export interface ShipmentInfo {
  trackingNumber: string;
  carrier: string;
}

// GL-WF-039: Update order with shipment info
export async function updateOrderShipment(orderId: string, shipment: ShipmentInfo): Promise<Order> {
  return apiFetch<Order>(`/api/v1/supplier/orders/${orderId}/shipment`, {
    method: 'PATCH',
    body: JSON.stringify(shipment),
  });
}

// GL-WF-038: Update individual order item status
export interface ItemStatusUpdate {
  status: 'pending' | 'partial' | 'received' | 'rejected';
  receivedQuantity?: number;
}

export async function updateOrderItemStatus(
  orderId: string,
  itemId: string,
  update: ItemStatusUpdate
): Promise<{ id: string; status: string; receivedQuantity: number; orderedQuantity: number; updatedAt: string }> {
  return apiFetch(`/api/v1/supplier/orders/${orderId}/items/${itemId}/status`, {
    method: 'PATCH',
    body: JSON.stringify(update),
  });
}
