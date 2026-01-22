// API Utility - Authenticated fetch wrapper
// Handles 401 responses by clearing auth state and redirecting to login

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
    console.warn('[API] Missing token for protected request, skipping fetch:', url);
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

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Handle 401 Unauthorized - trigger logout
  if (response.status === 401 && resolvedToken && !isAuthRequest) {
    console.log('[API] 401 Unauthorized - triggering auth failure');
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
