import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
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

const TOKEN_KEY = 'retailer_access_token';
const REFRESH_TOKEN_KEY = 'retailer_refresh_token';
const USER_KEY = 'retailer_user';
const STORE_KEY = 'retailer_store';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [store, setStore] = useState<Store | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const storedUser = localStorage.getItem(USER_KEY);
    const storedStore = localStorage.getItem(STORE_KEY);

    if (storedToken && storedUser && storedStore) {
      try {
        setAccessToken(storedToken);
        setUser(JSON.parse(storedUser));
        setStore(JSON.parse(storedStore));
      } catch {
        // Clear invalid data
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem(STORE_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  const login = (newAccessToken: string, newRefreshToken: string, newUser: User, newStore: Store) => {
    setAccessToken(newAccessToken);
    setUser(newUser);
    setStore(newStore);

    localStorage.setItem(TOKEN_KEY, newAccessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, newRefreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    localStorage.setItem(STORE_KEY, JSON.stringify(newStore));
  };

  const logout = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStore(null);

    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(STORE_KEY);
  }, []);

  // Subscribe to auth failures (401 responses) - triggers logout
  useEffect(() => {
    return onAuthFailure(() => {
      console.log('[Auth] Received auth failure event - logging out');
      logout();
    });
  }, [logout]);

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
