'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getAuthToken, clearAuthToken, logoutApi, getSupplierProfile, refreshAccessToken, Supplier } from './api';

// GO-LIVE-111: Idle timeout configuration (30 minutes)
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const LAST_ACTIVITY_KEY = 'supplier_last_activity';

// AUTH-EXPIRY-002: Token refresh configuration
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 minutes before expiry
const TOKEN_CHECK_INTERVAL_MS = 60 * 1000; // Check every 60 seconds

interface AuthContextType {
  supplier: Supplier | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  logout: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  supplier: null,
  isLoading: true,
  isAuthenticated: false,
  logout: () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  // GO-LIVE-111: Idle timeout ref
  const idleCheckRef = useRef<NodeJS.Timeout | null>(null);

  const refreshProfile = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setSupplier(null);
      setIsLoading(false);
      return;
    }

    // GO-LIVE-111: Check idle timeout on profile refresh
    const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
    if (lastActivity) {
      const elapsed = Date.now() - parseInt(lastActivity, 10);
      if (elapsed > IDLE_TIMEOUT_MS) {
        console.log('[Auth] Session expired due to inactivity');
        clearAuthToken();
        localStorage.removeItem(LAST_ACTIVITY_KEY);
        setSupplier(null);
        setIsLoading(false);
        return;
      }
    }

    try {
      const profile = await getSupplierProfile();
      setSupplier(profile);
      // GO-LIVE-111: Update activity on successful auth
      localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    } catch (error) {
      console.error('[Auth] Failed to fetch profile:', error);
      clearAuthToken();
      localStorage.removeItem(LAST_ACTIVITY_KEY);
      setSupplier(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const logout = useCallback(() => {
    // AUTH-LOGOUT-002: Revoke session on backend (fire-and-forget)
    logoutApi();
    clearAuthToken();
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    setSupplier(null);
    if (idleCheckRef.current) {
      clearInterval(idleCheckRef.current);
      idleCheckRef.current = null;
    }
    router.push('/login');
  }, [router]);

  // GO-LIVE-111: Activity tracking + idle timeout
  useEffect(() => {
    if (!supplier) {
      if (idleCheckRef.current) {
        clearInterval(idleCheckRef.current);
        idleCheckRef.current = null;
      }
      return;
    }

    // Update last activity on user interaction (throttled)
    let lastWrite = 0;
    const updateActivity = () => {
      const now = Date.now();
      if (now - lastWrite > 60000) { // Write at most once per minute
        localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
        lastWrite = now;
      }
    };

    // Listen for user activity
    window.addEventListener('mousemove', updateActivity);
    window.addEventListener('keydown', updateActivity);
    window.addEventListener('click', updateActivity);
    window.addEventListener('scroll', updateActivity);

    // Check for idle timeout periodically
    idleCheckRef.current = setInterval(() => {
      const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
      if (!lastActivity) return;
      const elapsed = Date.now() - parseInt(lastActivity, 10);
      if (elapsed > IDLE_TIMEOUT_MS) {
        console.log('[Auth] Logging out due to inactivity');
        logout();
      }
    }, 30000); // Check every 30 seconds

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
  }, [supplier, logout]);

  // AUTH-EXPIRY-002: Periodic token refresh before expiry
  const tokenRefreshRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!supplier) {
      if (tokenRefreshRef.current) {
        clearInterval(tokenRefreshRef.current);
        tokenRefreshRef.current = null;
      }
      return;
    }

    const getTokenExpiry = (token: string): number | null => {
      try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const payload = JSON.parse(atob(parts[1]));
        return payload.exp ? payload.exp * 1000 : null;
      } catch {
        return null;
      }
    };

    const checkAndRefresh = async () => {
      const token = getAuthToken();
      if (!token) return;

      const expiry = getTokenExpiry(token);
      if (!expiry) return;

      const timeUntilExpiry = expiry - Date.now();

      if (timeUntilExpiry > 0 && timeUntilExpiry <= TOKEN_EXPIRY_BUFFER_MS) {
        console.log('[Auth] Token expires soon, refreshing...');
        const success = await refreshAccessToken();
        if (!success) {
          console.warn('[Auth] Token refresh failed, user may need to re-login');
        }
      } else if (timeUntilExpiry <= 0) {
        console.log('[Auth] Token expired, attempting refresh...');
        const success = await refreshAccessToken();
        if (!success) {
          logout();
        }
      }
    };

    checkAndRefresh();
    tokenRefreshRef.current = setInterval(checkAndRefresh, TOKEN_CHECK_INTERVAL_MS);

    return () => {
      if (tokenRefreshRef.current) {
        clearInterval(tokenRefreshRef.current);
        tokenRefreshRef.current = null;
      }
    };
  }, [supplier, logout]);

  return (
    <AuthContext.Provider
      value={{
        supplier,
        isLoading,
        isAuthenticated: !!supplier,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// HOC for protected routes
export function withAuth<P extends object>(Component: React.ComponentType<P>) {
  return function ProtectedComponent(props: P) {
    const { isAuthenticated, isLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
      if (!isLoading && !isAuthenticated) {
        router.push('/login');
      }
    }, [isLoading, isAuthenticated, router]);

    if (isLoading) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      );
    }

    // GL-CRIT-0065: Show redirect message instead of null
    if (!isAuthenticated) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen text-slate-500">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mb-4" />
          <p className="text-sm">Redirecting to login...</p>
        </div>
      );
    }

    return <Component {...props} />;
  };
}
