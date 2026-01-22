import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { onAuthFailure } from './api';

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
}

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = 'retailerAdminToken';
const LEGACY_TOKEN_KEY = 'retailer_access_token';
const REFRESH_TOKEN_KEY = 'retailer_refresh_token';
const USER_KEY = 'retailer_user';
const STORE_KEY = 'retailer_store';
// RCAT-AUTH-001: Idle timeout configuration
const LAST_ACTIVITY_KEY = 'retailer_last_activity';
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [store, setStore] = useState<Store | null>(null);

  // RCAT-AUTH-001: Track whether session has been expired by idle timeout
  const idleCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const legacyToken = localStorage.getItem(LEGACY_TOKEN_KEY);
    const resolvedToken = storedToken || legacyToken;
    const storedUser = localStorage.getItem(USER_KEY);
    const storedStore = localStorage.getItem(STORE_KEY);

    if (resolvedToken && storedUser && storedStore) {
      // RCAT-AUTH-001: Check if session has expired due to idle timeout
      const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
      const lastActivityTime = lastActivity ? parseInt(lastActivity, 10) : Date.now();
      const isExpired = Date.now() - lastActivityTime > IDLE_TIMEOUT_MS;

      if (isExpired) {
        // Session expired due to idle - clear all auth data
        console.log('[Auth] Session expired due to idle timeout');
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(LEGACY_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem(STORE_KEY);
        localStorage.removeItem(LAST_ACTIVITY_KEY);
      } else {
        try {
          setAccessToken(resolvedToken);
          setUser(JSON.parse(storedUser));
          setStore(JSON.parse(storedStore));
          // Update last activity on successful restore
          localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
          if (!storedToken && legacyToken) {
            localStorage.setItem(TOKEN_KEY, legacyToken);
            localStorage.removeItem(LEGACY_TOKEN_KEY);
          }
        } catch {
          // Clear invalid data
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(LEGACY_TOKEN_KEY);
          localStorage.removeItem(REFRESH_TOKEN_KEY);
          localStorage.removeItem(USER_KEY);
          localStorage.removeItem(STORE_KEY);
          localStorage.removeItem(LAST_ACTIVITY_KEY);
        }
      }
    } else if (storedToken || legacyToken || storedUser || storedStore) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(STORE_KEY);
      localStorage.removeItem(LAST_ACTIVITY_KEY);
    }
    setIsLoading(false);
  }, []);

  const login = (newAccessToken: string, newRefreshToken: string, newUser: User, newStore: Store) => {
    setAccessToken(newAccessToken);
    setUser(newUser);
    setStore(newStore);

    localStorage.setItem(TOKEN_KEY, newAccessToken);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    localStorage.setItem(REFRESH_TOKEN_KEY, newRefreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    localStorage.setItem(STORE_KEY, JSON.stringify(newStore));
    // RCAT-AUTH-001: Set initial last activity on login
    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
  };

  const logout = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStore(null);

    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(STORE_KEY);
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    // Clear idle check interval
    if (idleCheckRef.current) {
      clearInterval(idleCheckRef.current);
      idleCheckRef.current = null;
    }
  }, []);

  // Subscribe to auth failures (401 responses) - triggers logout
  useEffect(() => {
    return onAuthFailure(() => {
      console.log('[Auth] Received auth failure event - logging out');
      logout();
    });
  }, [logout]);

  // RCAT-AUTH-001: Activity tracking + idle timeout
  useEffect(() => {
    if (!accessToken) return;

    // Update last activity on user interaction (throttled to avoid excessive writes)
    let lastWrite = 0;
    const updateActivity = () => {
      const now = Date.now();
      if (now - lastWrite > 60000) { // Write at most once per minute
        localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
        lastWrite = now;
      }
    };

    // Listen for user activity events
    window.addEventListener('mousemove', updateActivity);
    window.addEventListener('keydown', updateActivity);
    window.addEventListener('click', updateActivity);
    window.addEventListener('scroll', updateActivity);

    // Check for idle timeout every minute
    idleCheckRef.current = setInterval(() => {
      const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
      if (!lastActivity) return;
      const elapsed = Date.now() - parseInt(lastActivity, 10);
      if (elapsed > IDLE_TIMEOUT_MS) {
        console.log('[Auth] Idle timeout reached (30 min) - logging out');
        logout();
      }
    }, 60000); // Check every 60 seconds

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
