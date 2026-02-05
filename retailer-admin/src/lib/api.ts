// API Utility - Authenticated fetch wrapper
// Handles 401 responses by clearing auth state and redirecting to login

/**
 * DEPLOY-003: API base URL for production gateway.
 * When VITE_API_BASE_URL is set (e.g. http://localhost:3000), all relative
 * API paths are prefixed with it. When empty, relative paths are used (requires Nginx proxy).
 */
export const API_GATEWAY_BASE = import.meta.env.VITE_API_BASE_URL || '';

/**
 * Event system for auth state changes
 * Components can listen for auth failures to trigger logout
 */
type AuthFailureListener = () => void;
const authFailureListeners: AuthFailureListener[] = [];
const TOKEN_STORAGE_KEY = 'retailerAdminToken';
const LEGACY_TOKEN_STORAGE_KEY = 'retailer_access_token';
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
 * Authenticated fetch wrapper
 * - Automatically adds Authorization header with access token or localStorage token
 * - Skips protected requests when no token is available
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

  const storedToken = typeof window !== 'undefined'
    ? (localStorage.getItem(TOKEN_STORAGE_KEY) || localStorage.getItem(LEGACY_TOKEN_STORAGE_KEY))
    : null;
  const resolvedToken = accessToken || storedToken;
  const isAuthRequest = isRetailerAdminAuthRequest(url);
  const isRetailerAdmin = isRetailerAdminRequest(url);
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  // Add auth header if token exists
  if (resolvedToken) {
    headers['Authorization'] = `Bearer ${resolvedToken}`;
  } else if (isRetailerAdmin && !isAuthRequest) {
    return new Response(
      JSON.stringify({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing authentication token',
        },
      }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // Add Content-Type for JSON if body exists and not already set
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  // CACHE-000: Prevent browser from caching API responses
  const response = await fetch(resolvedUrl, {
    ...options,
    headers,
    cache: "no-store",
  });

  // Handle 401 Unauthorized - trigger logout
  if (response.status === 401 && resolvedToken && !isAuthRequest) {
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
