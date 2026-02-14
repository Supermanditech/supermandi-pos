// API Utility - Authenticated fetch wrapper
// Handles 401 responses by clearing auth state and redirecting to login

/**
 * DEPLOY-003: API base URL for production gateway.
 * When VITE_API_BASE_URL is set (e.g. the local dev server), all relative
 * API paths are prefixed with it. When empty, relative paths are used (requires Nginx proxy).
 */
export const API_GATEWAY_BASE = import.meta.env.VITE_API_BASE_URL || '';

/**
 * Event system for auth state changes
 * Components can listen for auth failures to trigger logout
 */
type AuthFailureListener = () => void;
const authFailureListeners: AuthFailureListener[] = [];
const RETAILER_ADMIN_PATH = '/api/v1/retailer-admin';
const RETAILER_ADMIN_AUTH_PATH = '/api/v1/retailer-admin/auth';

export function onAuthFailure(listener: AuthFailureListener) {
  authFailureListeners.push(listener);
  return () => {
    const index = authFailureListeners.indexOf(listener);
    if (index > -1) authFailureListeners.splice(index, 1);
  };
}

function notifyAuthFailure() {
  authFailureListeners.forEach(listener => listener());
}

function isRetailerAdminRequest(url: string) {
  return url.includes(RETAILER_ADMIN_PATH);
}

function isRetailerAdminAuthRequest(url: string) {
  return url.includes(RETAILER_ADMIN_AUTH_PATH);
}

/**
 * AUTH-STORAGE-001: Check if auth indicator cookie is present.
 * The sm_auth cookie is non-HttpOnly and indicates an active session.
 */
export function hasAuthCookie(): boolean {
  return typeof document !== 'undefined' && document.cookie.includes('sm_auth=');
}

/**
 * Authenticated fetch wrapper
 * AUTH-STORAGE-001: Uses HttpOnly cookies for auth (credentials: 'include').
 * Falls back to Authorization header if accessToken provided (for POS app / backward compat).
 * - Handles 401 responses by notifying auth failure listeners (triggers logout)
 * - Returns response for further processing
 */
export async function authFetch(
  url: string,
  accessToken: string | null,
  options: RequestInit = {}
): Promise<Response> {
  // DEPLOY-003: Prefix relative API paths with gateway base URL
  const resolvedUrl = (url.startsWith('/') && API_GATEWAY_BASE) ? API_GATEWAY_BASE + url : url;

  const isAuthRequest = isRetailerAdminAuthRequest(url);
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  // AUTH-STORAGE-001: If explicit accessToken provided (in-memory), add Authorization header
  // This is belt-and-suspenders: cookie also sent via credentials: 'include'
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  // Add Content-Type for JSON if body exists and not already set
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  // AUDIT-RET-050: Configurable timeout (default 30s, CSV imports may need longer)
  const timeoutMs = (options as any).timeoutMs ?? 30000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // AUTH-STORAGE-001: credentials: 'include' sends HttpOnly cookies automatically
  // CACHE-000: Prevent browser from caching API responses
  let response: Response;
  try {
    response = await fetch(resolvedUrl, {
      ...options,
      headers,
      credentials: 'include',
      cache: "no-store",
      signal: options.signal ?? controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  // Handle 401 Unauthorized - trigger logout for non-auth retailer requests
  if (response.status === 401 && !isAuthRequest && isRetailerAdminRequest(url)) {
    notifyAuthFailure();
  }

  return response;
}

/**
 * Parse JSON response with error handling
 */
export async function parseJsonResponse<T>(response: Response): Promise<{
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}> {
  try {
    const json = await response.json();

    if (!response.ok) {
      return {
        ok: false,
        error: json.error || { code: 'UNKNOWN', message: 'Request failed' },
      };
    }

    return {
      ok: true,
      data: json.data || json,
    };
  } catch {
    return {
      ok: false,
      error: { code: 'PARSE_ERROR', message: 'Failed to parse response' },
    };
  }
}

/**
 * GO-LIVE-020: Safe JSON parsing helper
 * Safely parse JSON from response, returning fallback on parse errors
 * Use this instead of direct response.json() calls to handle 500 errors gracefully
 */
export async function safeJson<T = any>(response: Response, fallback: T | null = null): Promise<T | null> {
  try {
    return await response.json();
  } catch {
    // On parse failure (e.g., 500 HTML response), return fallback
    console.warn(`[GO-LIVE-020] JSON parse failed for response status ${response.status}`);
    return fallback;
  }
}

/**
 * GO-LIVE-020: Safe JSON parsing with error extraction
 * Returns { data, error } tuple - use this for API calls that need error messages
 */
/**
 * AUTH-LOGOUT-001: Revoke refresh token on backend (fire-and-forget)
 * AUTH-STORAGE-001: Uses HttpOnly cookies - tokens sent automatically via credentials: 'include'
 * Non-blocking: local logout succeeds even if backend call fails.
 */
export async function logoutApi(): Promise<void> {
  try {
    const apiBase = API_GATEWAY_BASE || '';
    await fetch(`${apiBase}/api/v1/retailer-admin/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
  } catch {
    console.warn('[AUTH-LOGOUT-001] Backend logout call failed (non-blocking)');
  }
}

export async function safeJsonWithError<T = any>(response: Response): Promise<{
  data: T | null;
  error: { code: string; message: string } | null;
}> {
  try {
    const json = await response.json();
    if (!response.ok) {
      return {
        data: null,
        error: json.error || { code: 'API_ERROR', message: json.message || 'Request failed' },
      };
    }
    return { data: json, error: null };
  } catch {
    return {
      data: null,
      error: {
        code: 'PARSE_ERROR',
        message: response.status >= 500
          ? 'Server error. Please try again later.'
          : 'Failed to parse server response',
      },
    };
  }
}

// =============================================================================
// STAGING-FIX-004: Retailer Registration API (KYC/Application flow)
// =============================================================================

const REGISTRATION_BASE = `${API_GATEWAY_BASE}/api/v1/retailer-admin/registration`;
const DOCUMENTS_BASE = `${API_GATEWAY_BASE}/api/v1/documents`;

export interface CreateRetailerApplicationInput {
  phone: string;
  businessName: string;
  ownerName: string;
  gstin: string;
  businessType?: string;
  email?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

export interface ApplicationResponse {
  success: boolean;
  application: {
    id: string;
    status: string;
    createdAt?: string;
  };
  nextStep: string;
  message: string;
}

export async function createRetailerApplication(
  data: CreateRetailerApplicationInput
): Promise<ApplicationResponse> {
  // AUDIT-RET-051: Include credentials for cookie-based auth
  const response = await fetch(`${REGISTRATION_BASE}/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  // AUDIT-RET-041/052: Use safeJson + throw proper Error
  const json = await safeJson(response);
  if (!response.ok) {
    throw new Error(json?.error?.message || `Registration failed (${response.status})`);
  }
  return json;
}

export async function verifyRetailerOtp(data: {
  idToken: string;
  applicationId: string;
}): Promise<{ success: boolean; nextStep: string; message: string }> {
  // AUDIT-RET-051: Include credentials for cookie-based auth
  const response = await fetch(`${REGISTRATION_BASE}/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  // AUDIT-RET-041/052: Use safeJson + throw proper Error
  const json = await safeJson(response);
  if (!response.ok) {
    throw new Error(json?.error?.message || `OTP verification failed (${response.status})`);
  }
  return json;
}

export async function uploadDocument(
  file: File,
  documentType: string,
  entityType: string,
  entityId: string,
): Promise<{ success: boolean }> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('document_type', documentType);
  formData.append('entity_type', entityType);
  formData.append('entity_id', entityId);

  // AUDIT-RET-051: Include credentials for cookie-based auth
  // STBT-187.8: Add 60s timeout for FormData uploads
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);
  let response: Response;
  try {
    response = await fetch(`${DOCUMENTS_BASE}/upload`, {
      method: 'POST',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'include',
      body: formData,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
  // AUDIT-RET-041/052: Use safeJson + throw proper Error
  const json = await safeJson(response);
  if (!response.ok) {
    throw new Error(json?.error?.message || `Upload failed (${response.status})`);
  }
  return json;
}

export async function submitRetailerKyc(
  applicationId: string
): Promise<{ success: boolean; application: { id: string; status: string }; message: string }> {
  // AUDIT-RET-051: Include credentials for cookie-based auth
  const response = await fetch(`${REGISTRATION_BASE}/submit-kyc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ applicationId }),
  });
  // AUDIT-RET-041/052: Use safeJson + throw proper Error
  const json = await safeJson(response);
  if (!response.ok) {
    const err = new Error(json?.error?.message || `KYC submission failed (${response.status})`);
    (err as any).missingDocuments = json?.missingDocuments;
    throw err;
  }
  return json;
}

export async function getApplicationStatus(
  applicationId: string
): Promise<{ application: Record<string, unknown>; documents: Array<Record<string, unknown>> }> {
  // AUDIT-RET-051: Include credentials for cookie-based auth
  const response = await fetch(`${REGISTRATION_BASE}/status/${applicationId}`, {
    credentials: 'include',
  });
  // AUDIT-RET-041/052: Use safeJson + throw proper Error
  const json = await safeJson(response);
  if (!response.ok) {
    throw new Error(json?.error?.message || `Failed to get status (${response.status})`);
  }
  return json;
}

// STAGING-FIX-006: Lookup registration by phone for resume flow
export interface LookupResponse {
  exists: boolean;
  application_id?: string;
  status?: string;
  action?: string;
  message?: string;
}

export async function lookupRetailerRegistration(phone: string): Promise<LookupResponse> {
  // STBT-187.9: Use POST to avoid PII (phone) in URL/query string/logs/history
  const response = await fetch(
    `${REGISTRATION_BASE}/lookup`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }), credentials: 'include' }
  );
  // AUDIT-RET-041/052: Use safeJson + throw proper Error
  const json = await safeJson(response);
  if (!response.ok) {
    throw new Error(json?.error?.message || `Lookup failed (${response.status})`);
  }
  return json;
}
