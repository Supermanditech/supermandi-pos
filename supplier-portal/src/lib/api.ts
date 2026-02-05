// SM-023: API client for supplier portal
// SUP-LOGIN-001: Use same-origin fallback (empty string) when no API URL configured
// This allows relative paths to work through nginx reverse proxy in production
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || '';

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

// GO-LIVE-B9: Type for API error responses
interface ApiErrorResponse {
  error?: {
    code?: string;
    message?: string;
  };
}

// GO-LIVE-169: Response validation utility
function validateResponseStructure(data: unknown, endpoint: string): void {
  if (data === null || data === undefined) {
    console.warn(`[GO-LIVE-169] API response is null/undefined for ${endpoint}`);
    return;
  }

  // Check for unexpected error field in success response
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    if ('error' in obj && obj.error) {
      console.error(`[GO-LIVE-169] Unexpected error in success response for ${endpoint}:`, obj.error);
    }
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
  localStorage.removeItem('supplier_refresh_token');
}

// AUTH-EXPIRY-002: Refresh token storage
export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('supplier_refresh_token');
}

export function setRefreshToken(token: string): void {
  localStorage.setItem('supplier_refresh_token', token);
}

// AUTH-EXPIRY-002: Refresh access token using stored refresh token
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

export async function refreshAccessToken(): Promise<boolean> {
  // Deduplicate concurrent refresh calls
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/supplier/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        console.warn('[AUTH-EXPIRY-002] Token refresh failed:', response.status);
        return false;
      }

      const data = await response.json();
      const newAccessToken = data.data?.accessToken || data.accessToken;

      if (newAccessToken) {
        setAuthToken(newAccessToken);
        console.log('[AUTH-EXPIRY-002] Token refreshed successfully');
        return true;
      }

      return false;
    } catch {
      console.warn('[AUTH-EXPIRY-002] Token refresh error (non-blocking)');
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// AUTH-LOGOUT-002: Revoke session on backend before clearing local state.
// Fire-and-forget: logout should succeed locally even if backend call fails.
export async function logoutApi(): Promise<void> {
  const token = getAuthToken();
  if (!token) return;
  try {
    await fetch(`${API_BASE_URL}/api/v1/supplier/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });
  } catch {
    // Swallow errors — local logout should always succeed
    console.warn('[AUTH-LOGOUT-002] Backend logout call failed (non-blocking)');
  }
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

// GO-LIVE-176: Request timeout for API calls (30 seconds)
const API_TIMEOUT_MS = 30000;

// Authenticated fetch wrapper
export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  // SUP-LOGIN-001: No hard fail - relative paths work through nginx proxy
  const token = getAuthToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // GO-LIVE-176: Add request timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    // GO-LIVE-176: Handle timeout/abort errors
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(408, 'TIMEOUT', 'Request timed out. Please try again.');
    }
    // GO-LIVE-177: Distinguish network errors from other errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new ApiError(0, 'NETWORK_ERROR', 'Network error. Please check your connection.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  // GL-WF-046 + AUTH-EXPIRY-002: Handle 401 with token refresh attempt
  if (response.status === 401) {
    const errorData: ApiErrorResponse = await response.json().catch(() => ({}));
    const isAuthEndpoint = endpoint === '/api/v1/supplier/auth/login' ||
                           endpoint === '/api/v1/supplier/auth/register' ||
                           endpoint === '/api/v1/supplier/auth/refresh';

    // AUTH-EXPIRY-002: Try token refresh before giving up
    if (!isAuthEndpoint && getRefreshToken()) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        // Retry the original request with the new token
        const newToken = getAuthToken();
        const retryHeaders = { ...headers };
        if (newToken) retryHeaders['Authorization'] = `Bearer ${newToken}`;
        const retryResponse = await fetch(`${API_BASE_URL}${endpoint}`, {
          ...options,
          headers: retryHeaders,
        });
        if (retryResponse.ok) {
          const retryData = await retryResponse.json();
          const retryResult = retryData.data ?? retryData;
          validateResponseStructure(retryResult, endpoint);
          return retryResult as T;
        }
        // Retry also failed — fall through to logout
      }
    }

    // Token refresh failed or no refresh token — redirect to login
    if (!isAuthEndpoint) {
      handle401Response();
    }
    throw new ApiError(401, errorData.error?.code || 'UNAUTHORIZED', errorData.error?.message || 'Session expired. Please login again.');
  }

  let data: ApiErrorResponse & Record<string, unknown>;
  try {
    data = await response.json();
  } catch (parseError) {
    // GO-LIVE-169: Handle JSON parse errors
    console.error(`[GO-LIVE-169] JSON parse error for ${endpoint}:`, parseError);
    throw new ApiError(response.status, 'INVALID_JSON', 'Server returned invalid response');
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      data.error?.code || 'UNKNOWN',
      data.error?.message || 'Request failed'
    );
  }

  // GO-LIVE-169: Validate response structure
  const result = data.data ?? data;
  validateResponseStructure(result, endpoint);

  return result as T;
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
  refreshToken?: string; // AUTH-EXPIRY-002: Refresh token for automatic renewal
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
  // AUTH-EXPIRY-002: Store refresh token for automatic renewal
  if (result.refreshToken) {
    setRefreshToken(result.refreshToken);
  }
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

// =============================================================================
// GO-LIVE-SUP-AUTH: Phone OTP ONLY Authentication (No Password)
// =============================================================================

export interface PhoneOtpRegisterInput {
  idToken: string;  // Firebase ID token (proves phone ownership)
  email: string;
  businessName: string;
  gstin?: string;
  // NO PASSWORD - OTP only model
}

export interface PhoneOtpLoginResponse {
  success: boolean;
  status: 'active' | 'pending' | 'inactive' | 'locked';
  token?: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
  supplier?: {
    id: string;
    phone: string;
    email: string;
    businessName: string;
    gstin?: string;
    verificationStatus: string;
  };
  message?: string;
}

/**
 * GO-LIVE-SUP-AUTH-002: Register supplier with Phone OTP + business details (no password)
 */
export async function phoneOtpRegister(input: PhoneOtpRegisterInput): Promise<{ success: boolean; message: string; data?: { supplier: Partial<Supplier> } }> {
  return apiFetch<{ success: boolean; message: string; data?: { supplier: Partial<Supplier> } }>('/api/v1/supplier/auth/firebase-register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/**
 * GO-LIVE-SUP-AUTH-001: Login with Phone OTP only (exchange Firebase token for JWT)
 */
export async function phoneOtpLogin(idToken: string): Promise<PhoneOtpLoginResponse> {
  const result = await apiFetch<PhoneOtpLoginResponse>('/api/v1/supplier/auth/firebase-login', {
    method: 'POST',
    body: JSON.stringify({ idToken }),
  });
  if (result.token) {
    setAuthToken(result.token);
  }
  // AUTH-EXPIRY-002: Store refresh token for automatic token renewal
  if (result.refreshToken) {
    setRefreshToken(result.refreshToken);
  }
  return result;
}

// GL-WF-034: Email verification functions
// GO-LIVE: Updated response format - 'sent' boolean indicates actual email delivery
export interface SendVerificationResponse {
  sent: boolean;
  message: string;
  expiresIn?: number; // seconds
  devCode?: string;
  errorCode?: string;
}

export async function sendVerificationEmail(): Promise<SendVerificationResponse> {
  return apiFetch<SendVerificationResponse>('/api/v1/supplier/auth/send-verification', {
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

// ITER3-P0-011: Maximum file size for CSV upload (5MB - aligned with backend)
const MAX_CSV_FILE_SIZE = 5 * 1024 * 1024;

export async function uploadProductsCsv(file: File): Promise<CsvUploadResult> {
  // SUP-LOGIN-001: No hard fail - relative paths work through nginx proxy

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
  // SUP-LOGIN-001: No hard fail - relative paths work through nginx proxy

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

// GO-LIVE-031: Payout order breakdown
export interface PayoutOrderItem {
  id: string;
  orderId: string;
  amountPaise: number;
  orderStatus: string;
  orderDate: string;
  storeName: string;
  createdAt: string;
}

// GO-LIVE-031: Get orders included in a payout
export async function getPayoutOrders(payoutId: string): Promise<PayoutOrderItem[]> {
  return apiFetch<PayoutOrderItem[]>(`/api/v1/supplier/payouts/${payoutId}/orders`);
}

// ============================================================================
// GL-WF-039: ORDER SHIPMENT APIs
// ============================================================================

// GO-LIVE-029: Added shipment date fields
export interface ShipmentInfo {
  trackingNumber: string;
  carrier: string;
  shipmentDate?: string;  // ISO date string
  expectedDeliveryDate?: string;  // ISO date string
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

// ============================================================================
// GO-LIVE-030: ORDER NOTES APIs
// ============================================================================

export interface OrderNote {
  id: string;
  authorType: 'supplier' | 'retailer' | 'system';
  authorName: string;
  message: string;
  isInternal: boolean;
  createdAt: string;
}

export interface OrderNoteInput {
  message: string;
  isInternal?: boolean;
}

// GO-LIVE-030: Get order notes
export async function getOrderNotes(orderId: string): Promise<OrderNote[]> {
  return apiFetch<OrderNote[]>(`/api/v1/supplier/orders/${orderId}/notes`);
}

// GO-LIVE-030: Add a note to an order
export async function addOrderNote(orderId: string, input: OrderNoteInput): Promise<OrderNote> {
  return apiFetch<OrderNote>(`/api/v1/supplier/orders/${orderId}/notes`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// ============================================================================
// REG-AUTH-302: REGISTRATION-FIRST AUTHENTICATION APIs
// ============================================================================

export interface SupplierRegistrationInput {
  phone: string;
  email: string;
  businessName: string;
  ownerName: string;
  gstin: string;  // Required for suppliers
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  bankAccountName?: string;
  upiVpa?: string;
}

export interface SupplierApplicationResponse {
  success: boolean;
  applicationId: string;
  status: string;
  message?: string;
  action?: 'CREATED' | 'RESUMED';
}

export interface SupplierCheckGstinResponse {
  exists: boolean;
  applicationId?: string;
  status?: string;
  supplierId?: string;
  message: string;
}

export interface SupplierApplicationStatusResponse {
  success: boolean;
  application: {
    id: string;
    status: string;
    businessName: string;
    ownerName: string;
    gstin: string;
    phoneVerified: boolean;
    approvedSupplierId?: string;
    rejectionReason?: string;
  };
}

// REG-AUTH-302: Check if GSTIN already exists
export async function checkSupplierGstin(gstin: string): Promise<SupplierCheckGstinResponse> {
  return apiFetch<SupplierCheckGstinResponse>('/api/v1/supplier/registration/check-gstin', {
    method: 'POST',
    body: JSON.stringify({ gstin }),
  });
}

// REG-AUTH-302: Create new supplier application
export async function createSupplierApplication(input: SupplierRegistrationInput): Promise<SupplierApplicationResponse> {
  return apiFetch<SupplierApplicationResponse>('/api/v1/supplier/registration/create', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// REG-AUTH-302: Verify OTP with applicationId (CRITICAL: requires applicationId!)
export async function verifySupplierOtp(idToken: string, applicationId: string): Promise<{ success: boolean; status: string; message?: string }> {
  return apiFetch<{ success: boolean; status: string; message?: string }>('/api/v1/supplier/registration/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ idToken, applicationId }),
  });
}

// REG-AUTH-302: Submit KYC documents
export async function submitSupplierKyc(applicationId: string): Promise<{ success: boolean; status: string; message: string }> {
  return apiFetch<{ success: boolean; status: string; message: string }>('/api/v1/supplier/registration/submit-kyc', {
    method: 'POST',
    body: JSON.stringify({ applicationId }),
  });
}

// REG-AUTH-302: Get application status
export async function getSupplierApplicationStatus(applicationId: string): Promise<SupplierApplicationStatusResponse> {
  return apiFetch<SupplierApplicationStatusResponse>(`/api/v1/supplier/registration/status/${applicationId}`);
}

// REG-AUTH-302: Resume existing application
export async function resumeSupplierApplication(gstin: string, phone: string): Promise<SupplierApplicationResponse> {
  return apiFetch<SupplierApplicationResponse>('/api/v1/supplier/registration/resume', {
    method: 'POST',
    body: JSON.stringify({ gstin, phone }),
  });
}

// GO-LIVE-UI-REG-003: Lookup registration by phone (for login-first flow)
export interface SupplierLookupResponse {
  exists: boolean;
  application_id?: string;
  status?: 'DRAFT' | 'OTP_VERIFIED' | 'KYC_SUBMITTED' | 'UNDER_REVIEW' | 'ACTIVE' | 'REJECTED' | 'NEEDS_FIX' | 'EXPIRED';
  nextStep?: 'REGISTER' | 'VERIFY_PHONE' | 'UPLOAD_DOCUMENTS' | 'PENDING_APPROVAL' | 'FIX_REQUIRED' | 'CONTACT_SUPPORT' | 'LOGIN_ALLOWED';
  message: string;
  action?: 'REGISTER_REQUIRED';
  businessName?: string;
}

export async function lookupSupplierRegistration(phone: string): Promise<SupplierLookupResponse> {
  const encoded = encodeURIComponent(phone);
  return apiFetch<SupplierLookupResponse>(`/api/v1/supplier/registration/lookup?phone=${encoded}`);
}

// REG-AUTH-302: Upload document for application
export async function uploadSupplierDocument(
  applicationId: string,
  documentType: string,
  file: File
): Promise<{ success: boolean; documentId: string; message: string }> {
  // SUP-LOGIN-001: No hard fail - relative paths work through nginx proxy

  if (file.size > 5 * 1024 * 1024) {
    throw new ApiError(400, 'FILE_TOO_LARGE', 'File size exceeds maximum allowed (5MB)');
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('documentType', documentType);
  formData.append('entityType', 'supplier_application');
  formData.append('entityId', applicationId);

  const response = await fetch(`${API_BASE_URL}/api/v1/documents/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(response.status, data.error?.code || 'UNKNOWN', data.error?.message || 'Upload failed');
  }

  const data = await response.json();
  return data.data ?? data;
}
