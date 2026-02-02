/**
 * Admin authentication for SuperAdmin UI.
 * GO-LIVE-SESSION: Session-based authentication with JWT tokens via Email OTP
 *
 * Authentication Flow:
 * 1. User enters admin email address
 * 2. Backend sends OTP to email
 * 3. User verifies OTP, backend issues JWT session token
 * 4. JWT is stored in sessionStorage and used for API calls (Authorization: Bearer)
 * 5. JWT expires after 24 hours
 *
 * No static tokens required - all authentication is session-based.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;

// Storage keys
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
// SESSION TOKEN API (GO-LIVE-SESSION)
// =============================================================================

/**
 * Get admin token for API calls
 * GO-LIVE-SESSION: Returns session JWT token only
 */
export function getAdminToken(): string | undefined {
  return getSessionToken();
}

/**
 * Check if we have a valid session token
 */
export function hasValidSession(): boolean {
  return !!getSessionToken();
}

/**
 * Get auth headers for API calls
 * GO-LIVE-SESSION: Uses Authorization Bearer header with session JWT
 */
export function getAuthHeaders(): Record<string, string> {
  const sessionToken = getSessionToken();
  if (sessionToken) {
    return { Authorization: `Bearer ${sessionToken}` };
  }
  return {};
}

/**
 * Clear admin session (for logout compatibility)
 */
export function clearAdminToken(): void {
  clearSessionToken();
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

// =============================================================================
// GO-LIVE-LOGIN-004: Email OTP Authentication
// =============================================================================

/**
 * Send OTP to admin email
 * GO-LIVE-LOGIN-004: Email-based admin authentication
 */
export async function sendAdminOtp(email: string): Promise<{ success: boolean; error?: string; expiresIn?: number }> {
  if (!API_BASE) {
    return { success: false, error: "API base URL not configured" };
  }

  try {
    const res = await fetch(`${API_BASE}/api/v1/admin/auth/send-email-otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        success: false,
        error: data?.error?.message || `Failed to send OTP (${res.status})`,
      };
    }

    return {
      success: true,
      expiresIn: data.expiresIn,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

/**
 * Verify OTP and login
 * GO-LIVE-LOGIN-004: Email-based admin authentication
 */
export async function verifyAdminOtp(email: string, otp: string): Promise<{
  success: boolean;
  error?: string;
  token?: string;
  admin?: { email: string; role: string };
}> {
  if (!API_BASE) {
    return { success: false, error: "API base URL not configured" };
  }

  try {
    const res = await fetch(`${API_BASE}/api/v1/admin/auth/verify-email-otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, otp }),
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        success: false,
        error: data?.error?.message || `Failed to verify OTP (${res.status})`,
      };
    }

    // Store the JWT token
    if (data.token) {
      // Store as session token with 24h expiry
      const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
      try {
        sessionStorage.setItem(SESSION_TOKEN_KEY, data.token);
        sessionStorage.setItem(SESSION_EXPIRY_KEY, expiresAt.toString());
      } catch {
        // ignore storage errors
      }
    }

    return {
      success: true,
      token: data.token,
      admin: data.admin,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

