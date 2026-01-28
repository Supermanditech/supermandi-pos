import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
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

function AppRoutes() {
  return (
    <>
      <TrailingSlashRedirect />
      <Routes>
        {/* Root - show store URL prompt */}
        <Route path="/" element={
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', gap: '1rem' }}>
            <h2>SuperMandi Retailer Portal</h2>
            <p style={{ color: '#666' }}>Please use your store-specific URL to access the portal.</p>
          </div>
        } />

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
