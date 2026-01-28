'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getAuthToken, clearAuthToken, getSupplierProfile, Supplier } from './api';

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

  const refreshProfile = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setSupplier(null);
      setIsLoading(false);
      return;
    }

    try {
      const profile = await getSupplierProfile();
      setSupplier(profile);
    } catch (error) {
      console.error('[Auth] Failed to fetch profile:', error);
      clearAuthToken();
      setSupplier(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const logout = useCallback(() => {
    clearAuthToken();
    setSupplier(null);
    router.push('/login');
  }, [router]);

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
