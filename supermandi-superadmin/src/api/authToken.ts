/**
 * Admin authentication for SuperAdmin UI.
 * GO-LIVE-002: Session-based authentication with JWT tokens
 *
 * Authentication Flow:
 * 1. User enters master admin token
 * 2. Frontend calls /api/v1/admin/auth/login to exchange for session JWT
 * 3. Session JWT is stored in sessionStorage and used for API calls
 * 4. JWT expires after 8 hours, can be refreshed
 *
 * Fallback:
 * - If session login fails, falls back to legacy x-admin-token header
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;
const ENV_ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN as string | undefined;

// Storage keys
export const ADMIN_TOKEN_STORAGE_KEY = "supermandi_admin_token"; // Legacy master token
const SESSION_TOKEN_KEY = "supermandi_admin_session";
const SESSION_EXPIRY_KEY = "supermandi_admin_session_expiry";

// =============================================================================
// SESSION TOKEN MANAGEMENT (GO-LIVE-002)
// =============================================================================

/**
 * Get the current session token if valid
 */
export function getSessionToken(): string | undefined {
  try {
    const token = sessionStorage.getItem(SESSION_TOKEN_KEY);
    const expiry = sessionStorage.getItem(SESSION_EXPIRY_KEY);

    if (!token || !expiry) return undefined;

    // Check if expired (with 5 minute buffer for refresh)
    const expiryTime = parseInt(expiry, 10);
    if (Date.now() > expiryTime - 5 * 60 * 1000) {
      // Token is expired or about to expire
      return undefined;
    }

    return token;
  } catch {
    return undefined;
  }
}

/**
 * Store session token
 */
function setSessionToken(token: string, expiresAt: number): void {
  try {
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    sessionStorage.setItem(SESSION_EXPIRY_KEY, expiresAt.toString());
  } catch {
    // ignore
  }
}

/**
 * Clear session token
 */
function clearSessionToken(): void {
  try {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_EXPIRY_KEY);
  } catch {
    // ignore
  }
}

/**
 * Login with master token to get session JWT
 */
export async function loginWithMasterToken(masterToken: string): Promise<{ success: boolean; error?: string }> {
  if (!API_BASE) {
    return { success: false, error: "API base URL not configured" };
  }

  try {
    const res = await fetch(`${API_BASE}/api/v1/admin/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: masterToken }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        success: false,
        error: data?.error?.message || `Login failed (${res.status})`,
      };
    }

    const data = await res.json();
    if (data.sessionToken && data.expiresAt) {
      setSessionToken(data.sessionToken, data.expiresAt);
      // Also store master token as fallback
      setAdminToken(masterToken);
      return { success: true };
    }

    return { success: false, error: "Invalid response from server" };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

/**
 * Refresh the current session token
 * GO-LIVE-175: Enhanced error handling to log refresh failures
 */
export async function refreshSession(): Promise<boolean> {
  const currentToken = getSessionToken();
  if (!currentToken || !API_BASE) {
    return false;
  }

  try {
    const res = await fetch(`${API_BASE}/api/v1/admin/auth/refresh`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${currentToken}`,
      },
    });

    if (!res.ok) {
      // GO-LIVE-175: Log the specific error status for debugging
      console.warn(`[GO-LIVE-175] Session refresh failed with status ${res.status}`);
      if (res.status === 401) {
        // Token is invalid/expired, clear and redirect
        clearSessionToken();
        clearAdminToken();
      }
      return false;
    }

    let data: { sessionToken?: string; expiresAt?: number };
    try {
      data = await res.json();
    } catch (parseError) {
      // GO-LIVE-175: Log JSON parse errors
      console.error('[GO-LIVE-175] Failed to parse refresh response:', parseError);
      return false;
    }

    if (data.sessionToken && data.expiresAt) {
      setSessionToken(data.sessionToken, data.expiresAt);
      return true;
    }

    // GO-LIVE-175: Log unexpected response format
    console.warn('[GO-LIVE-175] Refresh response missing required fields:', Object.keys(data));
    return false;
  } catch (error) {
    // GO-LIVE-175: Log network/fetch errors instead of silently failing
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[GO-LIVE-175] Session refresh error: ${errorMessage}`);
    return false;
  }
}

/**
 * Logout - revoke session and clear tokens
 */
export async function logout(): Promise<void> {
  const sessionToken = getSessionToken();

  // Try to revoke session on server
  if (sessionToken && API_BASE) {
    try {
      await fetch(`${API_BASE}/api/v1/admin/auth/logout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });
    } catch {
      // Ignore errors - still clear local storage
    }
  }

  // Clear all tokens
  clearSessionToken();
  clearAdminToken();
}

// =============================================================================
// LEGACY TOKEN MANAGEMENT (backward compatibility)
// =============================================================================

/**
 * Get admin token for API calls
 * GO-LIVE-002: Prefers session token, falls back to master token
 */
export function getAdminToken(): string | undefined {
  // First try session token
  const sessionToken = getSessionToken();
  if (sessionToken) return sessionToken;

  // Fall back to legacy master token
  const envToken = (ENV_ADMIN_TOKEN ?? "").trim();
  if (envToken) return envToken;

  try {
    const v = sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
    const token = (v ?? "").trim();
    if (token) return token;
  } catch {
    // ignore
  }
  return undefined;
}

/**
 * Check if we have a valid session token (not just master token)
 */
export function hasValidSession(): boolean {
  return !!getSessionToken();
}

/**
 * Get auth headers for API calls
 * GO-LIVE-002: Uses Authorization header for session JWT, falls back to x-admin-token
 */
export function getAuthHeaders(): Record<string, string> {
  const sessionToken = getSessionToken();
  if (sessionToken) {
    return { Authorization: `Bearer ${sessionToken}` };
  }

  // Fall back to legacy header
  const token = getAdminToken();
  if (token) {
    return { "x-admin-token": token };
  }

  return {};
}

/**
 * Set admin token in session storage (legacy)
 */
export function setAdminToken(token: string): void {
  try {
    sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token.trim());
  } catch {
    // ignore
  }
}

/**
 * Clear admin token from session storage (legacy)
 */
export function clearAdminToken(): void {
  try {
    sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * GO-LIVE-171: Handle 401 responses by clearing session and redirecting to login
 * Call this when any API returns 401
 */
export function handle401Response(): void {
  console.warn("[GO-LIVE-171] 401 response - clearing session and redirecting to login");
  clearSessionToken();
  clearAdminToken();
  // Redirect to root (login page) using replace to prevent back navigation
  if (typeof window !== "undefined") {
    window.location.replace("/");
  }
}

