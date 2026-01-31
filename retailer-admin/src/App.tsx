import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import ProtectedLayout from './components/ProtectedLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ProductsPage from './pages/ProductsPage';
import ImportPage from './pages/ImportPage';
import InventoryPage from './pages/InventoryPage';
import SuppliersPage from './pages/SuppliersPage';
// CA-1.4-001: Supplier Catalog - browse approved products from verified suppliers
import SupplierCatalogPage from './pages/SupplierCatalogPage';
import CompliancePage from './pages/CompliancePage';
import AllPagesPage from './pages/AllPagesPage';
// GL-RJ-005: Store Settings page
import SettingsPage from './pages/SettingsPage';
// SM-024: Admin approval queue pages
import SupplierQueuePage from './pages/admin/SupplierQueuePage';
import ProductQueuePage from './pages/admin/ProductQueuePage';

// Normalize trailing slashes
function TrailingSlashRedirect() {
  const location = useLocation();

  useEffect(() => {
    if (location.pathname.endsWith('/') && location.pathname !== '/') {
      window.history.replaceState(null, '', location.pathname.slice(0, -1) + location.search);
    }
  }, [location.pathname, location.search]);

  return null;
}

// Protected route wrapper
// GL-CRIT-0023: Validates that URL storeCode matches authenticated user's store
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, store } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        Loading...
      </div>
    );
  }

  // Extract storeCode from current path
  const match = location.pathname.match(/^\/s\/([^/]+)/);
  const urlStoreCode = match?.[1];

  if (!isAuthenticated) {
    if (!urlStoreCode) {
      return <Navigate to="/" replace />;
    }
    // Redirect to login, preserving the intended destination
    return <Navigate to={`/s/${urlStoreCode}/login`} state={{ from: location }} replace />;
  }

  // GL-CRIT-0023: Validate URL storeCode matches user's authenticated store
  // This prevents users from accessing other stores' dashboards via URL manipulation
  if (store && urlStoreCode && urlStoreCode.toLowerCase() !== store.code.toLowerCase()) {
    console.warn(`[GL-CRIT-0023] URL storeCode "${urlStoreCode}" doesn't match user's store "${store.code}". Redirecting.`);
    // Redirect to user's actual store
    return <Navigate to={`/s/${store.code}`} replace />;
  }

  return <>{children}</>;
}

// GL-WF-033: Admin role check wrapper for superadmin-only routes
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();

  // Check if user has admin privileges
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin' || user?.role === 'owner';

  if (!isAdmin) {
    // Extract storeCode from current path
    const match = location.pathname.match(/^\/s\/([^/]+)/);
    const storeCode = match?.[1];

    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100%',
        padding: '2rem',
        textAlign: 'center',
      }}>
        <div style={{
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '12px',
          padding: '2rem',
          maxWidth: '400px',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
          <h2 style={{ color: '#991b1b', marginBottom: '0.5rem' }}>Access Denied</h2>
          <p style={{ color: '#b91c1c', marginBottom: '1.5rem' }}>
            You don't have permission to access this page. Admin or Owner role is required.
          </p>
          <a
            href={`/s/${storeCode}`}
            style={{
              display: 'inline-block',
              padding: '0.75rem 1.5rem',
              background: '#3b82f6',
              color: 'white',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: '500',
            }}
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

// GO-LIVE-B9: Store code entry landing page
function StoreLandingPage() {
  const [storeCode, setStoreCode] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (storeCode.trim()) {
      navigate(`/s/${storeCode.trim().toUpperCase()}/login`);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      flexDirection: 'column',
      gap: '1.5rem',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '1rem'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '16px',
        padding: '2.5rem',
        boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
        maxWidth: '400px',
        width: '100%',
        textAlign: 'center'
      }}>
        <h1 style={{
          color: '#1a1a2e',
          marginBottom: '0.5rem',
          fontSize: '1.75rem',
          fontWeight: '700'
        }}>
          SuperMandi
        </h1>
        <h2 style={{
          color: '#4a5568',
          marginBottom: '1.5rem',
          fontSize: '1.1rem',
          fontWeight: '500'
        }}>
          Retailer Portal
        </h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{
              display: 'block',
              textAlign: 'left',
              marginBottom: '0.5rem',
              color: '#4a5568',
              fontSize: '0.9rem',
              fontWeight: '500'
            }}>
              Enter your Store Code
            </label>
            <input
              type="text"
              value={storeCode}
              onChange={(e) => setStoreCode(e.target.value)}
              placeholder="e.g., STORE001"
              style={{
                width: '100%',
                padding: '0.875rem 1rem',
                border: '2px solid #e2e8f0',
                borderRadius: '8px',
                fontSize: '1rem',
                textTransform: 'uppercase',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s',
                outline: 'none'
              }}
              onFocus={(e) => e.target.style.borderColor = '#667eea'}
              onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
            />
          </div>
          <button
            type="submit"
            disabled={!storeCode.trim()}
            style={{
              width: '100%',
              padding: '0.875rem',
              background: storeCode.trim() ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#e2e8f0',
              color: storeCode.trim() ? 'white' : '#a0aec0',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: storeCode.trim() ? 'pointer' : 'not-allowed',
              transition: 'transform 0.2s, box-shadow 0.2s'
            }}
          >
            Go to Login
          </button>
        </form>
        <p style={{
          color: '#718096',
          marginTop: '1.5rem',
          fontSize: '0.85rem',
          lineHeight: '1.5'
        }}>
          Your store code was provided during registration.
          <br />Contact support if you need assistance.
        </p>
      </div>
    </div>
  );
}

function AppRoutes() {
  return (
    <>
      <TrailingSlashRedirect />
      <Routes>
        {/* GO-LIVE-B9: Root - show store code entry form */}
        <Route path="/" element={<StoreLandingPage />} />

        {/* Login page - always accessible */}
        <Route path="/s/:storeCode/login" element={<LoginPage />} />

        {/* Protected routes */}
        <Route
          path="/s/:storeCode"
          element={
            <ProtectedRoute>
              <ProtectedLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="suppliers" element={<SuppliersPage />} />
          {/* CA-1.4-001: Supplier Catalog - browse and add approved products */}
          <Route path="supplier-catalog" element={<SupplierCatalogPage />} />
          <Route path="compliance" element={<CompliancePage />} />
          {/* GL-RJ-005: Store Settings page */}
          <Route path="settings" element={<SettingsPage />} />
          {/* SM-024: SuperAdmin approval queue pages */}
          {/* GL-WF-033: Wrap admin routes with role check */}
          <Route path="admin/suppliers" element={<AdminRoute><SupplierQueuePage /></AdminRoute>} />
          <Route path="admin/products" element={<AdminRoute><ProductQueuePage /></AdminRoute>} />
          {/* P2-RD-002: QA page hidden in production */}
          {import.meta.env.DEV && <Route path="_pages" element={<AllPagesPage />} />}
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
