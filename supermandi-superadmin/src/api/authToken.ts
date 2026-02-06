/**
 * Admin authentication for SuperAdmin UI.
 * GO-LIVE-SESSION: Session-based authentication with JWT tokens via Email OTP
 *
 * Authentication Flow:
 * 1. User enters admin email address
 * 2. Backend sends OTP to email
 * 3. User verifies OTP, backend issues JWT session token
 * 4. JWT is stored in localStorage and used for API calls (Authorization: Bearer)
 * 5. JWT expires after 24 hours
 *
 * POST-BATCH-018-FIX-003: localStorage for cross-tab persistence
 * POST-BATCH-018-FIX-002: No hard redirects from API modules — callers decide
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;

// Storage keys
const SESSION_TOKEN_KEY = "supermandi_admin_session";
const SESSION_EXPIRY_KEY = "supermandi_admin_session_expiry";
const LAST_ACTIVITY_KEY = "supermandi_admin_last_activity";

// AUTH-EXPIRY-003: Idle timeout configuration (30 minutes)
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

// =============================================================================
// SESSION TOKEN MANAGEMENT (GO-LIVE-002)
// =============================================================================

/**
 * Get the current session token if valid
 * POST-BATCH-018-FIX-003: Uses localStorage (cross-tab), no premature buffer
 */
export function getSessionToken(): string | undefined {
  try {
    const token = localStorage.getItem(SESSION_TOKEN_KEY);
    const expiry = localStorage.getItem(SESSION_EXPIRY_KEY);

    if (!token || !expiry) return undefined;

    // POST-BATCH-018-FIX-003: Only reject if actually expired (no 5-min buffer)
    const expiryTime = parseInt(expiry, 10);
    if (Date.now() > expiryTime) {
      return undefined;
    }

    return token;
  } catch {
    return undefined;
  }
}

/**
 * Store session token
 * POST-BATCH-018-FIX-003: Uses localStorage for cross-tab persistence
 */
function setSessionToken(token: string, expiresAt: number): void {
  try {
    localStorage.setItem(SESSION_TOKEN_KEY, token);
    localStorage.setItem(SESSION_EXPIRY_KEY, expiresAt.toString());
  } catch {
    // ignore
  }
}

/**
 * Clear session token
 */
function clearSessionToken(): void {
  try {
    localStorage.removeItem(SESSION_TOKEN_KEY);
    localStorage.removeItem(SESSION_EXPIRY_KEY);
    localStorage.removeItem(LAST_ACTIVITY_KEY);
  } catch {
    // ignore
  }
}

/**
 * Refresh the current session token
 * GO-LIVE-175: Enhanced error handling to log refresh failures
 * POST-BATCH-018-FIX-002: Only clears token on confirmed 401, not transient errors
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
      console.warn(`[GO-LIVE-175] Session refresh failed with status ${res.status}`);
      if (res.status === 401) {
        // Token is truly invalid/expired — clear it
        clearSessionToken();
      }
      return false;
    }

    let data: { sessionToken?: string; expiresAt?: number };
    try {
      data = await res.json();
    } catch (parseError) {
      console.error('[GO-LIVE-175] Failed to parse refresh response:', parseError);
      return false;
    }

    if (data.sessionToken && data.expiresAt) {
      setSessionToken(data.sessionToken, data.expiresAt);
      return true;
    }

    console.warn('[GO-LIVE-175] Refresh response missing required fields:', Object.keys(data));
    return false;
  } catch (error) {
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
 * POST-BATCH-018-FIX-002: Handle 401 — clear tokens only (no hard redirect).
 * Callers (polling, UI) decide whether to show inline error or redirect.
 * Kept as export for backward compatibility but no longer does window.location.replace.
 */
export function handle401Response(): void {
  console.warn("[FIX-002] 401 response — clearing session tokens");
  clearSessionToken();
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
 * POST-BATCH-018-FIX-003: Uses localStorage for cross-tab persistence
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
      const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
      try {
        localStorage.setItem(SESSION_TOKEN_KEY, data.token);
        localStorage.setItem(SESSION_EXPIRY_KEY, expiresAt.toString());
        localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
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

// =============================================================================
// AUTH-EXPIRY-003: Idle Timeout for SuperAdmin
// =============================================================================

let idleCheckInterval: ReturnType<typeof setInterval> | null = null;
let activityListenersAttached = false;
let lastWrite = 0;

function updateActivity(): void {
  const now = Date.now();
  if (now - lastWrite > 60000) {
    try {
      localStorage.setItem(LAST_ACTIVITY_KEY, now.toString());
    } catch {
      // ignore
    }
    lastWrite = now;
  }
}

/**
 * AUTH-EXPIRY-003: Start idle timeout tracking.
 * Calls onTimeout when user has been idle for 30 minutes.
 */
export function startIdleTimeout(onTimeout: () => void): void {
  stopIdleTimeout();

  try {
    if (!localStorage.getItem(LAST_ACTIVITY_KEY)) {
      localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
    }
  } catch {
    // ignore
  }

  if (typeof window !== "undefined") {
    window.addEventListener("mousemove", updateActivity);
    window.addEventListener("keydown", updateActivity);
    window.addEventListener("click", updateActivity);
    window.addEventListener("scroll", updateActivity);
    activityListenersAttached = true;
  }

  idleCheckInterval = setInterval(() => {
    try {
      const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
      if (!lastActivity) return;
      const elapsed = Date.now() - parseInt(lastActivity, 10);
      if (elapsed > IDLE_TIMEOUT_MS) {
        onTimeout();
      }
    } catch {
      // ignore
    }
  }, 30000);
}

/**
 * AUTH-EXPIRY-003: Stop idle timeout tracking.
 */
export function stopIdleTimeout(): void {
  if (idleCheckInterval) {
    clearInterval(idleCheckInterval);
    idleCheckInterval = null;
  }
  if (activityListenersAttached && typeof window !== "undefined") {
    window.removeEventListener("mousemove", updateActivity);
    window.removeEventListener("keydown", updateActivity);
    window.removeEventListener("click", updateActivity);
    window.removeEventListener("scroll", updateActivity);
    activityListenersAttached = false;
  }
}
