import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { onAuthFailure, API_GATEWAY_BASE, logoutApi, hasAuthCookie, safeJson } from './api';

// GO-LIVE-109 + AUTH-EXPIRY-001: Token refresh configuration
// Access token expires in 15 minutes. Refresh 5 minutes before expiry.
// Check interval of 30s ensures we catch expiry within half a minute.
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes before expiry
const TOKEN_CHECK_INTERVAL_MS = 30 * 1000; // Check every 30 seconds

interface User {
  id: string;
  phone: string;
  role: string;
  // REG-AUTH-301: Application status fields for LIMITED MODE
  applicationId?: string;
  applicationStatus?: string;
}

interface Store {
  id: string;
  code: string;
  name: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  store: Store | null;
  accessToken: string | null;
  login: (accessToken: string, refreshToken: string, user: User, store: Store) => void;
  logout: () => void;
  // GL-WF-028: Session expiry warning state
  showSessionWarning: boolean;
  dismissSessionWarning: () => void;
  // REG-AUTH-301: LIMITED MODE status
  isLimitedMode: boolean;
  applicationStatus: string | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

// GO-LIVE-133: localStorage keys namespaced per store
// This prevents data conflicts when multiple stores use the same browser
const ACTIVE_STORE_KEY = 'retailer_active_store_id'; // Tracks which store is currently active (not namespaced)

// Helper to generate namespaced keys
const getNamespacedKey = (storeId: string, key: string): string => `retailer_${storeId}_${key}`;

// Key suffixes for namespaced storage
// AUTH-STORAGE-001: Tokens NO LONGER stored in localStorage (moved to HttpOnly cookies)
const KEY_USER = 'user';
const KEY_STORE = 'store';
const KEY_LAST_ACTIVITY = 'last_activity';
const KEY_TOKEN_EXPIRES_AT = 'token_expires_at'; // AUTH-STORAGE-001: Non-sensitive timestamp for refresh scheduling

// Legacy keys to clear (migration + security cleanup)
const LEGACY_KEYS = [
  'retailerAdminToken',
  'retailer_access_token',
  'retailer_refresh_token',
  'retailer_user',
  'retailer_store',
  'retailer_last_activity',
];

// RCAT-AUTH-001: Idle timeout configuration
// GL-CRIT-0076: Make idle timeout configurable via environment variable
// Default: 30 minutes, can be overridden with VITE_IDLE_TIMEOUT_MINUTES
const IDLE_TIMEOUT_MINUTES = parseInt(import.meta.env.VITE_IDLE_TIMEOUT_MINUTES || '30', 10);
const IDLE_TIMEOUT_MS = Math.max(5, IDLE_TIMEOUT_MINUTES) * 60 * 1000; // Minimum 5 minutes
// GL-WF-028: Warning 5 minutes before timeout (or 1/6 of timeout if timeout is short)
const WARNING_BEFORE_MS = Math.min(5 * 60 * 1000, IDLE_TIMEOUT_MS / 6);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  // GL-WF-028: Session expiry warning state
  const [showSessionWarning, setShowSessionWarning] = useState(false);
  // AUTH-STORAGE-001: Track token expiry for refresh scheduling (in-memory)
  const tokenExpiresAtRef = useRef<number>(0);
  // ISSUE-MICRO-049: Mutex to prevent concurrent token refresh requests
  const isRefreshingRef = useRef(false);
  // ISSUE-MICRO-047: AbortController to cancel in-flight auth requests on logout
  const authAbortRef = useRef<AbortController>(new AbortController());

  // RCAT-AUTH-001: Track whether session has been expired by idle timeout
  const idleCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // AUTH-STORAGE-001: Helper to clear all auth data for a specific store
  // Tokens are no longer in localStorage (they're in HttpOnly cookies, cleared by server)
  const clearStoreAuth = useCallback((storeId: string) => {
    localStorage.removeItem(getNamespacedKey(storeId, KEY_USER));
    localStorage.removeItem(getNamespacedKey(storeId, KEY_STORE));
    localStorage.removeItem(getNamespacedKey(storeId, KEY_LAST_ACTIVITY));
    localStorage.removeItem(getNamespacedKey(storeId, KEY_TOKEN_EXPIRES_AT));
    // AUTH-STORAGE-001: Also clean up any leftover token keys from before migration
    localStorage.removeItem(getNamespacedKey(storeId, 'token'));
    localStorage.removeItem(getNamespacedKey(storeId, 'refresh_token'));
  }, []);

  // GO-LIVE-133: Helper to clear legacy (non-namespaced) auth data
  const clearLegacyAuth = useCallback(() => {
    LEGACY_KEYS.forEach(key => localStorage.removeItem(key));
  }, []);

  // AUTH-STORAGE-001: Load auth state from localStorage + cookie on mount
  // Tokens are in HttpOnly cookies (not readable by JS), user/store data in localStorage
  useEffect(() => {
    // Always clear legacy keys on mount (security cleanup)
    clearLegacyAuth();

    // Check for active store ID
    const activeStoreId = localStorage.getItem(ACTIVE_STORE_KEY);

    if (!activeStoreId) {
      // No active store - not authenticated
      setIsLoading(false);
      return;
    }

    // Check for stored user/store data AND auth cookie
    const storedUser = localStorage.getItem(getNamespacedKey(activeStoreId, KEY_USER));
    const storedStore = localStorage.getItem(getNamespacedKey(activeStoreId, KEY_STORE));

    // AUTH-STORAGE-001: Auth state = user data in localStorage + sm_auth cookie present
    if (storedUser && storedStore && hasAuthCookie()) {
      // RCAT-AUTH-001: Check if session has expired due to idle timeout
      const lastActivity = localStorage.getItem(getNamespacedKey(activeStoreId, KEY_LAST_ACTIVITY));
      const lastActivityTime = lastActivity ? parseInt(lastActivity, 10) : Date.now();
      const isExpired = Date.now() - lastActivityTime > IDLE_TIMEOUT_MS;

      if (isExpired) {
        // Session expired due to idle - clear auth data for this store
        clearStoreAuth(activeStoreId);
        localStorage.removeItem(ACTIVE_STORE_KEY);
      } else {
        try {
          setUser(JSON.parse(storedUser));
          setStore(JSON.parse(storedStore));
          // Restore tokenExpiresAt for refresh scheduling
          const storedExpiresAt = localStorage.getItem(getNamespacedKey(activeStoreId, KEY_TOKEN_EXPIRES_AT));
          if (storedExpiresAt) {
            tokenExpiresAtRef.current = parseInt(storedExpiresAt, 10);
          }
          // Update last activity on successful restore
          localStorage.setItem(getNamespacedKey(activeStoreId, KEY_LAST_ACTIVITY), String(Date.now()));
        } catch {
          // Clear invalid data
          clearStoreAuth(activeStoreId);
          localStorage.removeItem(ACTIVE_STORE_KEY);
        }
      }
    } else {
      // No valid session data - clear everything
      clearStoreAuth(activeStoreId);
      localStorage.removeItem(ACTIVE_STORE_KEY);
    }
    setIsLoading(false);
  }, [clearLegacyAuth, clearStoreAuth]);

  const login = (newAccessToken: string, _newRefreshToken: string, newUser: User, newStore: Store) => {
    // AUTH-STORAGE-001: Store access token in memory only (NOT in localStorage)
    // Tokens are in HttpOnly cookies set by the server
    setAccessToken(newAccessToken);
    setUser(newUser);
    setStore(newStore);

    // GO-LIVE-133: Store with namespaced keys per store ID
    const storeId = newStore.id;

    // Set active store ID first (this is the only non-namespaced key)
    localStorage.setItem(ACTIVE_STORE_KEY, storeId);

    // AUTH-STORAGE-001: Store user/store data (non-sensitive) but NOT tokens
    localStorage.setItem(getNamespacedKey(storeId, KEY_USER), JSON.stringify(newUser));
    localStorage.setItem(getNamespacedKey(storeId, KEY_STORE), JSON.stringify(newStore));
    // RCAT-AUTH-001: Set initial last activity on login
    localStorage.setItem(getNamespacedKey(storeId, KEY_LAST_ACTIVITY), String(Date.now()));

    // AUTH-STORAGE-001: Store token expiry timestamp (non-sensitive) for refresh scheduling
    // Parse the JWT to extract exp claim (access token is in memory so this is safe)
    try {
      const parts = newAccessToken.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        if (payload.exp) {
          const expiresAt = payload.exp * 1000;
          tokenExpiresAtRef.current = expiresAt;
          localStorage.setItem(getNamespacedKey(storeId, KEY_TOKEN_EXPIRES_AT), String(expiresAt));
        }
      }
    } catch { /* ignore parse errors */ }

    // Clear any legacy keys that might exist
    clearLegacyAuth();
  };

  const logout = useCallback(() => {
    // ISSUE-MICRO-047: Cancel in-flight auth requests (e.g., token refresh)
    authAbortRef.current.abort();
    authAbortRef.current = new AbortController();

    // GO-LIVE-133: Get current store ID before clearing state
    const activeStoreId = localStorage.getItem(ACTIVE_STORE_KEY);

    // AUTH-LOGOUT-001 + AUTH-STORAGE-001: Revoke session on backend via cookies (fire-and-forget)
    logoutApi();

    setAccessToken(null);
    setUser(null);
    setStore(null);
    tokenExpiresAtRef.current = 0;

    // GO-LIVE-133: Clear namespaced keys for the active store
    if (activeStoreId) {
      clearStoreAuth(activeStoreId);
    }
    localStorage.removeItem(ACTIVE_STORE_KEY);

    // Also clear any legacy keys that might exist
    clearLegacyAuth();

    // RET-008: Clear ALL retailer-related localStorage keys (any store prefix)
    // This prevents stale data from other stores lingering after full logout
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('retailer_') || key.startsWith('store_'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));

    // Clear idle check interval
    if (idleCheckRef.current) {
      clearInterval(idleCheckRef.current);
      idleCheckRef.current = null;
    }
  }, [clearLegacyAuth, clearStoreAuth]);

  // GL-WF-028: Dismiss warning and refresh activity timestamp
  const dismissSessionWarning = useCallback(() => {
    setShowSessionWarning(false);
    // GO-LIVE-133: Use namespaced key
    const activeStoreId = localStorage.getItem(ACTIVE_STORE_KEY);
    if (activeStoreId) {
      localStorage.setItem(getNamespacedKey(activeStoreId, KEY_LAST_ACTIVITY), String(Date.now()));
    }
  }, []);

  // AUTH-STORAGE-001: Refresh access token using HttpOnly cookie (no token in body needed)
  const refreshAccessToken = useCallback(async (): Promise<boolean> => {
    // ISSUE-MICRO-049: Prevent concurrent refresh (timer + mount can overlap on slow networks)
    if (isRefreshingRef.current) return true;
    isRefreshingRef.current = true;

    const activeStoreId = localStorage.getItem(ACTIVE_STORE_KEY);
    if (!activeStoreId) {
      console.log('[Auth] No active store for token refresh');
      isRefreshingRef.current = false;
      return false;
    }

    // AUTH-STORAGE-001: Check for auth cookie (refresh token is in HttpOnly cookie)
    if (!hasAuthCookie()) {
      console.log('[Auth] No auth cookie, cannot refresh');
      isRefreshingRef.current = false;
      return false;
    }

    try {
      const apiBase = API_GATEWAY_BASE || '';
      // AUTH-STORAGE-001: credentials: 'include' sends the refresh token cookie automatically
      const response = await fetch(`${apiBase}/api/v1/retailer-admin/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: authAbortRef.current.signal, // ISSUE-MICRO-047: Abort on logout
      });

      if (!response.ok) {
        console.warn('[Auth] Token refresh failed:', response.status);
        return false;
      }

      // AUDIT-RET-041: Use safeJson instead of bare response.json()
      const data = await safeJson(response) as { data?: { accessToken?: string; expiresIn?: number } } | null;
      const newAccessToken = data?.data?.accessToken;
      const expiresIn = data?.data?.expiresIn;

      if (newAccessToken) {
        // Store in memory only (cookies are set by server)
        setAccessToken(newAccessToken);
        // Update tokenExpiresAt
        if (expiresIn) {
          const expiresAt = Date.now() + expiresIn * 1000;
          tokenExpiresAtRef.current = expiresAt;
          localStorage.setItem(getNamespacedKey(activeStoreId, KEY_TOKEN_EXPIRES_AT), String(expiresAt));
        }
        console.log('[Auth] Token refreshed successfully');
        return true;
      }

      return false;
    } catch (error) {
      // ISSUE-MICRO-047: Silently handle abort (logout cancelled the request)
      if (error instanceof DOMException && error.name === 'AbortError') return false;
      console.error('[Auth] Token refresh error:', error);
      return false;
    } finally {
      isRefreshingRef.current = false;
    }
  }, []);

  // GO-LIVE-109: Automatic token refresh before expiry
  const tokenRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // AUTH-STORAGE-001: Use user state (not accessToken) as auth indicator
    // On page refresh, accessToken may be null but cookies are valid
    if (!user) {
      // Clear refresh interval when logged out
      if (tokenRefreshRef.current) {
        clearInterval(tokenRefreshRef.current);
        tokenRefreshRef.current = null;
      }
      return;
    }

    // Check token expiry periodically and refresh if needed
    const checkAndRefresh = async () => {
      const expiresAt = tokenExpiresAtRef.current;

      // If no known expiry (e.g., page refresh), refresh immediately to get fresh token
      if (!expiresAt || expiresAt === 0) {
        console.log('[Auth] No known token expiry, refreshing to get fresh token...');
        const success = await refreshAccessToken();
        if (!success) {
          console.warn('[Auth] Initial token refresh failed');
          logout();
        }
        return;
      }

      const timeUntilExpiry = expiresAt - Date.now();

      // Refresh if token expires within the buffer time
      if (timeUntilExpiry > 0 && timeUntilExpiry <= TOKEN_EXPIRY_BUFFER_MS) {
        console.log('[Auth] Token expires soon, refreshing...');
        const success = await refreshAccessToken();
        if (!success) {
          console.warn('[Auth] Token refresh failed, user may need to re-login');
        }
      } else if (timeUntilExpiry <= 0) {
        // Token already expired - try to refresh, logout if fails
        console.log('[Auth] Token expired, attempting refresh...');
        const success = await refreshAccessToken();
        if (!success) {
          logout();
        }
      }
    };

    // Run immediately on mount
    checkAndRefresh();

    // Then check periodically
    tokenRefreshRef.current = setInterval(checkAndRefresh, TOKEN_CHECK_INTERVAL_MS);

    return () => {
      if (tokenRefreshRef.current) {
        clearInterval(tokenRefreshRef.current);
        tokenRefreshRef.current = null;
      }
    };
  }, [user, refreshAccessToken, logout]);

  // Subscribe to auth failures (401 responses) - triggers logout
  useEffect(() => {
    return onAuthFailure(() => {
      logout();
    });
  }, [logout]);

  // RCAT-AUTH-001: Activity tracking + idle timeout
  useEffect(() => {
    if (!user) return;

    // GO-LIVE-133: Get active store ID for namespaced storage
    const activeStoreId = localStorage.getItem(ACTIVE_STORE_KEY);
    if (!activeStoreId) return;

    // Update last activity on user interaction (throttled to avoid excessive writes)
    let lastWrite = 0;
    const updateActivity = () => {
      const now = Date.now();
      if (now - lastWrite > 60000) { // Write at most once per minute
        // GO-LIVE-133: Use namespaced key
        localStorage.setItem(getNamespacedKey(activeStoreId, KEY_LAST_ACTIVITY), String(now));
        lastWrite = now;
      }
    };

    // Listen for user activity events
    window.addEventListener('mousemove', updateActivity);
    window.addEventListener('keydown', updateActivity);
    window.addEventListener('click', updateActivity);
    window.addEventListener('scroll', updateActivity);

    // GL-WF-028: Check for idle timeout and show warning before logout
    idleCheckRef.current = setInterval(() => {
      // GO-LIVE-133: Use namespaced key
      const lastActivity = localStorage.getItem(getNamespacedKey(activeStoreId, KEY_LAST_ACTIVITY));
      if (!lastActivity) return;
      const elapsed = Date.now() - parseInt(lastActivity, 10);

      // Show warning 5 minutes before timeout
      if (elapsed > IDLE_TIMEOUT_MS - WARNING_BEFORE_MS && elapsed <= IDLE_TIMEOUT_MS) {
        setShowSessionWarning(true);
      }

      // Logout after full timeout
      if (elapsed > IDLE_TIMEOUT_MS) {
        setShowSessionWarning(false);
        logout();
      }
    }, 30000); // Check every 30 seconds for more responsive warning

    return () => {
      window.removeEventListener('mousemove', updateActivity);
      window.removeEventListener('keydown', updateActivity);
      window.removeEventListener('click', updateActivity);
      window.removeEventListener('scroll', updateActivity);
      if (idleCheckRef.current) {
        clearInterval(idleCheckRef.current);
        idleCheckRef.current = null;
      }
    };
  }, [user, logout]);

  // REG-AUTH-301: Compute LIMITED MODE status
  // User is in limited mode if they have an application status that is NOT 'ACTIVE'
  const applicationStatus = user?.applicationStatus || null;
  const isLimitedMode = !!applicationStatus && applicationStatus.toUpperCase() !== 'ACTIVE';

  return (
    <AuthContext.Provider
      value={{
        // AUTH-STORAGE-001: Auth state based on user data + cookie, not just accessToken
        isAuthenticated: !!user && !!store,
        isLoading,
        user,
        store,
        accessToken,
        login,
        logout,
        // GL-WF-028: Session warning
        showSessionWarning,
        dismissSessionWarning,
        // REG-AUTH-301: LIMITED MODE
        isLimitedMode,
        applicationStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
