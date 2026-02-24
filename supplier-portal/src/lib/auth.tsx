'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { clearAuthToken, logoutApi, getSupplierProfile, refreshAccessToken, Supplier, hasAuthCookie } from './api';

// GO-LIVE-111: Idle timeout configuration (30 minutes)
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const LAST_ACTIVITY_KEY = 'supplier_last_activity';

// AUTH-EXPIRY-002: Token refresh configuration
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
    // AUTH-STORAGE-001: Check for auth cookie instead of localStorage token
    if (!hasAuthCookie()) {
      setSupplier(null);
      setIsLoading(false);
      return;
    }

    // GO-LIVE-111: Check idle timeout on profile refresh
    const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
    if (lastActivity) {
      const elapsed = Date.now() - parseInt(lastActivity, 10);
      if (elapsed > IDLE_TIMEOUT_MS) {
        // R6.SUP.027: Session expired due to inactivity — also invalidate server session
        logoutApi();
        clearAuthToken();
        localStorage.removeItem(LAST_ACTIVITY_KEY);
        setSupplier(null);
        setIsLoading(false);
        return;
      }
    }

    try {
      // AUTH-STORAGE-001: cookies sent automatically via credentials: 'include' in apiFetch
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
    // AUTH-LOGOUT-002 + AUTH-STORAGE-001: Revoke session on backend via cookies
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

    // ISSUE-MICRO-055: Warning threshold (5 minutes before timeout)
    const IDLE_WARNING_MS = IDLE_TIMEOUT_MS - 5 * 60 * 1000;
    let hasWarnedIdle = false;

    // Check for idle timeout periodically
    idleCheckRef.current = setInterval(() => {
      const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
      if (!lastActivity) return;
      const elapsed = Date.now() - parseInt(lastActivity, 10);

      // ISSUE-MICRO-055: Warn 5 minutes before idle logout
      if (elapsed > IDLE_WARNING_MS && elapsed <= IDLE_TIMEOUT_MS && !hasWarnedIdle) {
        hasWarnedIdle = true;
        toast('Your session will expire in 5 minutes due to inactivity. Click anywhere to stay logged in.', {
          icon: '\u23F0',
          duration: 10000,
        });
      }

      if (elapsed > IDLE_TIMEOUT_MS) {
        // Logging out due to inactivity
        logout();
      }

      // Reset warning flag if user became active again
      if (elapsed <= IDLE_WARNING_MS) {
        hasWarnedIdle = false;
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

  // AUTH-EXPIRY-002 + AUTH-STORAGE-001: Periodic token refresh via cookies
  const tokenRefreshRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!supplier) {
      if (tokenRefreshRef.current) {
        clearInterval(tokenRefreshRef.current);
        tokenRefreshRef.current = null;
      }
      return;
    }

    // AUTH-STORAGE-001: Simplified refresh - just call refresh periodically
    // Cookies handle auth, no need to parse JWT for expiry
    // ISSUE-MICRO-050: Track refresh failures to avoid repeated warnings
    let hasWarnedRefresh = false;
    const checkAndRefresh = async () => {
      if (!hasAuthCookie()) {
        logout();
        return;
      }
      // Proactively refresh to keep access token fresh
      // The server will check idle timeout and refuse if inactive
      const success = await refreshAccessToken();
      // ISSUE-MICRO-050: Warn on refresh failure (once, until next success)
      if (!success && hasAuthCookie() && !hasWarnedRefresh) {
        hasWarnedRefresh = true;
        toast('Session refresh failed. Please save your work.', { icon: '\u26A0\uFE0F', duration: 5000 });
      } else if (success) {
        hasWarnedRefresh = false;
      }
    };

    // First refresh after 10 minutes, then every check interval
    const initialDelay = setTimeout(() => {
      checkAndRefresh();
      tokenRefreshRef.current = setInterval(checkAndRefresh, TOKEN_CHECK_INTERVAL_MS);
    }, 10 * 60 * 1000); // Wait 10 minutes before first proactive refresh

    return () => {
      clearTimeout(initialDelay);
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
