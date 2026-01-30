import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { onAuthFailure, API_GATEWAY_BASE } from './api';

// GO-LIVE-109: Token refresh configuration
// Refresh token 5 minutes before expiry (JWT expires in 24h)
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes
const TOKEN_CHECK_INTERVAL_MS = 60 * 1000; // Check every minute

interface User {
  id: string;
  phone: string;
  role: string;
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
}

const AuthContext = createContext<AuthContextType | null>(null);

// GO-LIVE-133: localStorage keys namespaced per store
// This prevents data conflicts when multiple stores use the same browser
const ACTIVE_STORE_KEY = 'retailer_active_store_id'; // Tracks which store is currently active (not namespaced)

// Helper to generate namespaced keys
const getNamespacedKey = (storeId: string, key: string): string => `retailer_${storeId}_${key}`;

// Key suffixes for namespaced storage
const KEY_TOKEN = 'token';
const KEY_REFRESH_TOKEN = 'refresh_token';
const KEY_USER = 'user';
const KEY_STORE = 'store';
const KEY_LAST_ACTIVITY = 'last_activity';

// Legacy keys for migration (will be cleared after successful migration)
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

  // RCAT-AUTH-001: Track whether session has been expired by idle timeout
  const idleCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // GO-LIVE-133: Helper to clear all auth data for a specific store
  const clearStoreAuth = useCallback((storeId: string) => {
    localStorage.removeItem(getNamespacedKey(storeId, KEY_TOKEN));
    localStorage.removeItem(getNamespacedKey(storeId, KEY_REFRESH_TOKEN));
    localStorage.removeItem(getNamespacedKey(storeId, KEY_USER));
    localStorage.removeItem(getNamespacedKey(storeId, KEY_STORE));
    localStorage.removeItem(getNamespacedKey(storeId, KEY_LAST_ACTIVITY));
  }, []);

  // GO-LIVE-133: Helper to clear legacy (non-namespaced) auth data
  const clearLegacyAuth = useCallback(() => {
    LEGACY_KEYS.forEach(key => localStorage.removeItem(key));
  }, []);

  // Load from localStorage on mount
  useEffect(() => {
    // GO-LIVE-133: First check for active store ID
    const activeStoreId = localStorage.getItem(ACTIVE_STORE_KEY);

    // GO-LIVE-133: Try to migrate from legacy keys if no active store
    if (!activeStoreId) {
      // Check for legacy data to migrate
      const legacyToken = localStorage.getItem('retailerAdminToken') || localStorage.getItem('retailer_access_token');
      const legacyStore = localStorage.getItem('retailer_store');

      if (legacyToken && legacyStore) {
        try {
          const parsedStore = JSON.parse(legacyStore);
          const storeId = parsedStore.id;

          if (storeId) {
            console.log('[Auth] GO-LIVE-133: Migrating legacy auth data to namespaced storage');

            // Migrate all legacy data to namespaced keys
            const legacyUser = localStorage.getItem('retailer_user');
            const legacyRefresh = localStorage.getItem('retailer_refresh_token');
            const legacyActivity = localStorage.getItem('retailer_last_activity');

            localStorage.setItem(ACTIVE_STORE_KEY, storeId);
            localStorage.setItem(getNamespacedKey(storeId, KEY_TOKEN), legacyToken);
            if (legacyRefresh) localStorage.setItem(getNamespacedKey(storeId, KEY_REFRESH_TOKEN), legacyRefresh);
            if (legacyUser) localStorage.setItem(getNamespacedKey(storeId, KEY_USER), legacyUser);
            localStorage.setItem(getNamespacedKey(storeId, KEY_STORE), legacyStore);
            if (legacyActivity) localStorage.setItem(getNamespacedKey(storeId, KEY_LAST_ACTIVITY), legacyActivity);

            // Clear legacy keys after migration
            clearLegacyAuth();

            // Now proceed with normal loading using the migrated data
            const lastActivityTime = legacyActivity ? parseInt(legacyActivity, 10) : Date.now();
            const isExpired = Date.now() - lastActivityTime > IDLE_TIMEOUT_MS;

            if (isExpired) {
              clearStoreAuth(storeId);
              localStorage.removeItem(ACTIVE_STORE_KEY);
            } else {
              setAccessToken(legacyToken);
              setUser(legacyUser ? JSON.parse(legacyUser) : null);
              setStore(parsedStore);
              localStorage.setItem(getNamespacedKey(storeId, KEY_LAST_ACTIVITY), String(Date.now()));
            }
            setIsLoading(false);
            return;
          }
        } catch (e) {
          console.error('[Auth] GO-LIVE-133: Migration failed:', e);
          clearLegacyAuth();
        }
      } else {
        // No legacy data and no active store - clean slate
        clearLegacyAuth();
      }
      setIsLoading(false);
      return;
    }

    // GO-LIVE-133: Load from namespaced keys using active store ID
    const storedToken = localStorage.getItem(getNamespacedKey(activeStoreId, KEY_TOKEN));
    const storedUser = localStorage.getItem(getNamespacedKey(activeStoreId, KEY_USER));
    const storedStore = localStorage.getItem(getNamespacedKey(activeStoreId, KEY_STORE));

    if (storedToken && storedUser && storedStore) {
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
          setAccessToken(storedToken);
          setUser(JSON.parse(storedUser));
          setStore(JSON.parse(storedStore));
          // Update last activity on successful restore
          localStorage.setItem(getNamespacedKey(activeStoreId, KEY_LAST_ACTIVITY), String(Date.now()));
        } catch {
          // Clear invalid data
          clearStoreAuth(activeStoreId);
          localStorage.removeItem(ACTIVE_STORE_KEY);
        }
      }
    } else {
      // Incomplete data - clear everything for this store
      clearStoreAuth(activeStoreId);
      localStorage.removeItem(ACTIVE_STORE_KEY);
    }
    setIsLoading(false);
  }, [clearLegacyAuth, clearStoreAuth]);

  const login = (newAccessToken: string, newRefreshToken: string, newUser: User, newStore: Store) => {
    setAccessToken(newAccessToken);
    setUser(newUser);
    setStore(newStore);

    // GO-LIVE-133: Store with namespaced keys per store ID
    const storeId = newStore.id;

    // Set active store ID first (this is the only non-namespaced key)
    localStorage.setItem(ACTIVE_STORE_KEY, storeId);

    // Store all auth data under namespaced keys
    localStorage.setItem(getNamespacedKey(storeId, KEY_TOKEN), newAccessToken);
    localStorage.setItem(getNamespacedKey(storeId, KEY_REFRESH_TOKEN), newRefreshToken);
    localStorage.setItem(getNamespacedKey(storeId, KEY_USER), JSON.stringify(newUser));
    localStorage.setItem(getNamespacedKey(storeId, KEY_STORE), JSON.stringify(newStore));
    // RCAT-AUTH-001: Set initial last activity on login
    localStorage.setItem(getNamespacedKey(storeId, KEY_LAST_ACTIVITY), String(Date.now()));

    // Clear any legacy keys that might exist
    clearLegacyAuth();
  };

  const logout = useCallback(() => {
    // GO-LIVE-133: Get current store ID before clearing state
    const activeStoreId = localStorage.getItem(ACTIVE_STORE_KEY);

    setAccessToken(null);
    setUser(null);
    setStore(null);

    // GO-LIVE-133: Clear namespaced keys for the active store
    if (activeStoreId) {
      clearStoreAuth(activeStoreId);
    }
    localStorage.removeItem(ACTIVE_STORE_KEY);

    // Also clear any legacy keys that might exist
    clearLegacyAuth();

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

  // GO-LIVE-109: Parse JWT to get expiry time
  const getTokenExpiry = useCallback((token: string): number | null => {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const payload = JSON.parse(atob(parts[1]));
      return payload.exp ? payload.exp * 1000 : null; // Convert to milliseconds
    } catch {
      return null;
    }
  }, []);

  // GO-LIVE-109: Refresh access token using refresh token
  const refreshAccessToken = useCallback(async (): Promise<boolean> => {
    // GO-LIVE-133: Use namespaced key for refresh token
    const activeStoreId = localStorage.getItem(ACTIVE_STORE_KEY);
    if (!activeStoreId) {
      console.log('[Auth] No active store for token refresh');
      return false;
    }

    const refreshToken = localStorage.getItem(getNamespacedKey(activeStoreId, KEY_REFRESH_TOKEN));
    if (!refreshToken) {
      console.log('[Auth] No refresh token available');
      return false;
    }

    try {
      const apiBase = API_GATEWAY_BASE || '';
      const response = await fetch(`${apiBase}/api/v1/retailer-admin/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        console.warn('[Auth] Token refresh failed:', response.status);
        return false;
      }

      const data = await response.json();
      const newAccessToken = data.data?.accessToken;

      if (newAccessToken) {
        setAccessToken(newAccessToken);
        // GO-LIVE-133: Store with namespaced key
        localStorage.setItem(getNamespacedKey(activeStoreId, KEY_TOKEN), newAccessToken);
        console.log('[Auth] Token refreshed successfully');
        return true;
      }

      return false;
    } catch (error) {
      console.error('[Auth] Token refresh error:', error);
      return false;
    }
  }, []);

  // GO-LIVE-109: Automatic token refresh before expiry
  const tokenRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!accessToken) {
      // Clear refresh interval when logged out
      if (tokenRefreshRef.current) {
        clearInterval(tokenRefreshRef.current);
        tokenRefreshRef.current = null;
      }
      return;
    }

    // Check token expiry periodically and refresh if needed
    const checkAndRefresh = async () => {
      const expiry = getTokenExpiry(accessToken);
      if (!expiry) return;

      const timeUntilExpiry = expiry - Date.now();

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
  }, [accessToken, getTokenExpiry, refreshAccessToken, logout]);

  // Subscribe to auth failures (401 responses) - triggers logout
  useEffect(() => {
    return onAuthFailure(() => {
      logout();
    });
  }, [logout]);

  // RCAT-AUTH-001: Activity tracking + idle timeout
  useEffect(() => {
    if (!accessToken) return;

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
  }, [accessToken, logout]);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: !!accessToken,
        isLoading,
        user,
        store,
        accessToken,
        login,
        logout,
        // GL-WF-028: Session warning
        showSessionWarning,
        dismissSessionWarning,
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
