/**
 * Admin authentication for SuperAdmin UI.
 * GO-LIVE-SESSION: Session-based authentication with JWT tokens via Email OTP
 *
 * Authentication Flow:
 * 1. User enters admin email address
 * 2. Backend sends OTP to email
 * 3. User verifies OTP, backend issues JWT session token + sets HttpOnly cookie
 * 4. SEC-010: HttpOnly cookie is PRIMARY auth; localStorage tracks expiry only
 * 5. JWT expires after 24 hours
 *
 * SEC-010: Migrated from localStorage token to HttpOnly cookie auth.
 *   - Backend already sets `admin_session` HttpOnly cookie on login/refresh
 *   - localStorage stores 'cookie-auth' flag + expiry (no actual token)
 *   - Authorization header only sent for legacy sessions (backward compat)
 * POST-BATCH-018-FIX-003: localStorage for cross-tab persistence
 * POST-BATCH-018-FIX-002: No hard redirects from API modules — callers decide
 */

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;
// STG-518: Enforce HTTPS in production — match retailer-admin FIX-019
if (API_BASE && API_BASE.startsWith('http:') && import.meta.env.PROD) {
  throw new Error('[STG-518] VITE_API_BASE_URL must use HTTPS in production. Got: ' + API_BASE);
}

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
 * SEC-010: Returns 'cookie-auth' flag (not actual token) for cookie-based sessions.
 *   Legacy sessions that still have an actual JWT return it for backward compat.
 * POST-BATCH-018-FIX-003: Uses localStorage (cross-tab), no premature buffer
 */
export function getSessionToken(): string | undefined {
  try {
    const flag = localStorage.getItem(SESSION_TOKEN_KEY);
    const expiry = localStorage.getItem(SESSION_EXPIRY_KEY);

    if (!flag || !expiry) return undefined;

    // POST-BATCH-018-FIX-003: Only reject if actually expired (no 5-min buffer)
    const expiryTime = parseInt(expiry, 10);
    if (Date.now() > expiryTime) {
      return undefined;
    }

    // SEC-010: Return the flag (not actual token) — cookies handle auth
    return flag;
  } catch {
    return undefined;
  }
}

/**
 * Store session metadata (expiry + auth flag)
 * SEC-010: Don't store actual token in localStorage (XSS risk).
 *   Backend sets HttpOnly cookie; we only track expiry for UX.
 * POST-BATCH-018-FIX-003: Uses localStorage for cross-tab persistence
 */
function setSessionToken(_token: string, expiresAt: number): void {
  try {
    // SEC-010: Store a flag (not the token) so JS knows we're logged in
    localStorage.setItem(SESSION_TOKEN_KEY, 'cookie-auth');
    localStorage.setItem(SESSION_EXPIRY_KEY, expiresAt.toString());
    localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
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
 * XPORT-001: Dedup mutex prevents concurrent refresh races
 */
let _isRefreshing = false;
let _refreshPromise: Promise<boolean> | null = null;

export async function refreshSession(): Promise<boolean> {
  // XPORT-001: Deduplicate concurrent refresh calls (same pattern as supplier portal)
  if (_isRefreshing && _refreshPromise) {
    return _refreshPromise;
  }

  const currentToken = getSessionToken();
  if (!currentToken) {
    return false;
  }

  _isRefreshing = true;
  _refreshPromise = _doRefreshSession(currentToken);
  return _refreshPromise;
}

async function _doRefreshSession(currentToken: string): Promise<boolean> {
  try {
    // STAGING-FIX-006: Use fetchWithTimeout (30s) instead of raw fetch to prevent hanging
    // STG-176: Include body + Content-Type to prevent GCP LB 411 on bodyless POST
    // SEC-010: Only send Authorization header for legacy sessions (actual JWT)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (currentToken !== 'cookie-auth') {
      headers.Authorization = `Bearer ${currentToken}`;
    }
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/auth/refresh`, {
      method: "POST",
      credentials: 'include',
      headers,
      body: '{}',
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
  } finally {
    // XPORT-001: Release mutex
    _isRefreshing = false;
    _refreshPromise = null;
  }
}

/**
 * Logout - revoke session and clear tokens
 */
export async function logout(): Promise<void> {
  const sessionToken = getSessionToken();

  // Try to revoke session on server
  if (sessionToken) {
    try {
      // STAGING-FIX-006: Use fetchWithTimeout (10s) — logout should not hang
      // STG-176: Include body + Content-Type to prevent GCP LB 411 on bodyless POST
      // SEC-010: Only send Authorization header for legacy sessions (actual JWT)
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (sessionToken !== 'cookie-auth') {
        headers.Authorization = `Bearer ${sessionToken}`;
      }
      await fetchWithTimeout(`${API_BASE}/api/v1/admin/auth/logout`, {
        method: "POST",
        credentials: 'include',
        timeoutMs: 10000,
        headers,
        body: '{}',
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
 * SEC-010: HttpOnly cookie is primary auth. Authorization header only sent
 *   for legacy sessions that still have an actual JWT (backward compat).
 * GO-LIVE-SESSION: Uses Authorization Bearer header with session JWT
 */
export function getAuthHeaders(): Record<string, string> {
  // ISSUE-MICRO-081: Add correlation ID for cross-service request tracing
  // ISSUE-035: Include X-Requested-With for CSRF protection on all requests (incl. bodyless DELETE)
  const headers: Record<string, string> = {
    'X-Request-ID': crypto.randomUUID(),
    'X-Requested-With': 'XMLHttpRequest',
  };
  const sessionToken = getSessionToken();
  // SEC-010: Only set Authorization header for legacy sessions (actual JWT).
  // 'cookie-auth' means HttpOnly cookie is handling auth — no Bearer needed.
  if (sessionToken && sessionToken !== 'cookie-auth') {
    headers.Authorization = `Bearer ${sessionToken}`;
  }
  return headers;
}

/**
 * Clear admin session (for logout compatibility)
 */
export function clearAdminToken(): void {
  clearSessionToken();
}

// ISSUE-MICRO-063: Global AbortController for tab-change cancellation
let tabController = new AbortController();

/**
 * ISSUE-MICRO-063: Abort all in-flight requests (call on tab change).
 * Creates a fresh controller so new requests on the next tab work normally.
 */
export function abortActiveRequests(): void {
  tabController.abort();
  tabController = new AbortController();
}

/**
 * ISSUE-MICRO-107: Fetch wrapper with 30s timeout to prevent hanging requests.
 * ISSUE-MICRO-025: Includes credentials for HttpOnly cookie auth.
 * ISSUE-MICRO-063: Cascades tab-change abort to in-flight requests.
 * STAGING-FIX-005: Auto-clears stale token on 401 and dispatches auth-expired event.
 * Drop-in replacement for global fetch() — adds AbortController with 30s default.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const { timeoutMs = 30000, ...fetchInit } = init ?? {};

  // If caller provided their own signal, use it directly (skip tab/timeout logic)
  if (fetchInit.signal) {
    const res = await fetch(input, { ...fetchInit, credentials: fetchInit.credentials ?? 'include' });
    if (res.status === 401) handleAutoLogout();
    return res;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // ISSUE-MICRO-063: Cascade tab-change abort to this request's controller
  const onTabAbort = () => controller.abort();
  tabController.signal.addEventListener('abort', onTabAbort, { once: true });

  try {
    const res = await fetch(input, {
      ...fetchInit,
      credentials: fetchInit.credentials ?? 'include',
      signal: controller.signal,
    });
    // STAGING-FIX-005: Auto-clear stale token on 401 so UI can show login gate
    if (res.status === 401) handleAutoLogout();
    return res;
  } finally {
    clearTimeout(timeoutId);
    tabController.signal.removeEventListener('abort', onTabAbort);
  }
}

/**
 * STAGING-FIX-005: Clear stale token and notify UI on 401.
 * Dispatches a custom window event so App.tsx can show the login gate.
 * Debounced to avoid multiple rapid logouts from concurrent API calls.
 */
let autoLogoutFired = false;
function handleAutoLogout(): void {
  if (autoLogoutFired) return;
  autoLogoutFired = true;
  console.warn('[STAGING-FIX-005] 401 received — clearing stale session token');
  clearSessionToken();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('supermandi-auth-expired'));
  }
  // Reset debounce after 2s so future 401s after re-login are also handled
  setTimeout(() => { autoLogoutFired = false; }, 2000);
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
  try {
    // STAGING-FIX-006: Use fetchWithTimeout (30s) instead of raw fetch
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/auth/send-email-otp`, {
      method: "POST",
      credentials: 'include',
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
  } catch (err: unknown) {
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
  // GCP-STG-0457: unlockAt timestamp for lockout countdown display
  unlockAt?: number;
}> {
  try {
    // STAGING-FIX-006: Use fetchWithTimeout (30s) instead of raw fetch
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/auth/verify-email-otp`, {
      method: "POST",
      credentials: 'include',
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
        // GCP-STG-0457: Pass unlockAt from 429 lockout response
        unlockAt: data?.error?.unlockAt,
      };
    }

    // SEC-010: Don't store actual token in localStorage (XSS risk)
    // Backend already sets HttpOnly cookie; just track expiry for UX
    if (data.token) {
      // AUDIT-SA-039: Use server-provided expiresIn (seconds), fallback to 24h
      const ttlMs = (data.expiresIn ? data.expiresIn * 1000 : 24 * 60 * 60 * 1000);
      const expiresAt = Date.now() + ttlMs;
      try {
        localStorage.setItem(SESSION_EXPIRY_KEY, expiresAt.toString());
        localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
        // Keep a flag (not the token) so JS knows we're logged in
        localStorage.setItem(SESSION_TOKEN_KEY, 'cookie-auth');
      } catch {
        // ignore storage errors
      }
    }

    return {
      success: true,
      token: data.token,
      admin: data.admin,
    };
  } catch (err: unknown) {
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
