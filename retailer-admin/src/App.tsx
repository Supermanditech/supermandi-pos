import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import React, { useEffect, Suspense, lazy } from 'react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import ProtectedLayout from './components/ProtectedLayout';

// RET-AUD-048: Lazy load pages for code splitting and better performance at scale
// Critical auth pages loaded eagerly for fast initial load
import LoginPage from './pages/LoginPage';
// GO-LIVE-AUTH-FIX: Removed old RegisterPage - use RetailerOnboardingPage for full store registration (RET-WEB-001)
const RetailerOnboardingPage = lazy(() => import('./pages/RetailerOnboardingPage'));

// RET-AUD-048: Dashboard pages - lazy loaded for route-level code splitting
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ProductsPage = lazy(() => import('./pages/ProductsPage'));
const ImportPage = lazy(() => import('./pages/ImportPage'));
const InventoryPage = lazy(() => import('./pages/InventoryPage'));
const SuppliersPage = lazy(() => import('./pages/SuppliersPage'));
// CA-1.4-001: Supplier Catalog - browse approved products from verified suppliers
const SupplierCatalogPage = lazy(() => import('./pages/SupplierCatalogPage'));
const CompliancePage = lazy(() => import('./pages/CompliancePage'));
const AllPagesPage = lazy(() => import('./pages/AllPagesPage'));
// GL-RJ-005: Store Settings page
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
// RET-WEB-002: Device Activation page
const DeviceActivationPage = lazy(() => import('./pages/DeviceActivationPage'));
// RET-WEB-003: Payments Setup page
const PaymentsPage = lazy(() => import('./pages/PaymentsPage'));
// SM-024: Admin approval queue pages
const SupplierQueuePage = lazy(() => import('./pages/admin/SupplierQueuePage'));
const ProductQueuePage = lazy(() => import('./pages/admin/ProductQueuePage'));

// RET-AUD-048: Loading fallback component for Suspense boundaries
const PageLoadingFallback = () => (
  <div style={{
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
    minHeight: '200px',
    color: '#64748b',
    fontSize: '0.9rem',
  }}>
    Loading...
  </div>
);

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
    // GO-LIVE-RET-AUTH-001: Always redirect to /retailer/login (OTP first, store selection after)
    return <Navigate to="/retailer/login" state={{ from: location }} replace />;
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

// GO-LIVE-RET-AUTH-001: Removed StoreLandingPage - now using direct /retailer/login with OTP first

function AppRoutes() {
  return (
    <>
      <TrailingSlashRedirect />
      <Routes>
        {/* GO-LIVE-RET-AUTH-001: Root redirects to /retailer/login (OTP first, store selection after) */}
        <Route path="/" element={<Navigate to="/retailer/login" replace />} />

        {/* Auth pages - accessible without authentication */}
        <Route path="/retailer/login" element={<LoginPage />} />
        {/* GO-LIVE-AUTH-FIX: /retailer/register now routes to full store onboarding (RET-WEB-001) */}
        {/* RET-AUD-048: Lazy loaded with Suspense */}
        <Route path="/retailer/register" element={<Suspense fallback={<PageLoadingFallback />}><RetailerOnboardingPage /></Suspense>} />
        {/* REG-AUTH-301: Alias for onboarding page */}
        <Route path="/retailer/onboard" element={<Suspense fallback={<PageLoadingFallback />}><RetailerOnboardingPage /></Suspense>} />

        {/* Legacy routes - redirect to new paths */}
        <Route path="/s/:storeCode/login" element={<Navigate to="/retailer/login" replace />} />
        <Route path="/s/:storeCode/register" element={<Navigate to="/retailer/register" replace />} />

        {/* Protected routes - RET-AUD-048: All pages lazy loaded with Suspense for code splitting */}
        <Route
          path="/s/:storeCode"
          element={
            <ProtectedRoute>
              <ProtectedLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Suspense fallback={<PageLoadingFallback />}><DashboardPage /></Suspense>} />
          <Route path="products" element={<Suspense fallback={<PageLoadingFallback />}><ProductsPage /></Suspense>} />
          <Route path="import" element={<Suspense fallback={<PageLoadingFallback />}><ImportPage /></Suspense>} />
          <Route path="inventory" element={<Suspense fallback={<PageLoadingFallback />}><InventoryPage /></Suspense>} />
          <Route path="suppliers" element={<Suspense fallback={<PageLoadingFallback />}><SuppliersPage /></Suspense>} />
          {/* CA-1.4-001: Supplier Catalog - browse and add approved products */}
          <Route path="supplier-catalog" element={<Suspense fallback={<PageLoadingFallback />}><SupplierCatalogPage /></Suspense>} />
          <Route path="compliance" element={<Suspense fallback={<PageLoadingFallback />}><CompliancePage /></Suspense>} />
          {/* GL-RJ-005: Store Settings page */}
          <Route path="settings" element={<Suspense fallback={<PageLoadingFallback />}><SettingsPage /></Suspense>} />
          {/* RET-WEB-003: Payments Setup page */}
          <Route path="settings/payments" element={<Suspense fallback={<PageLoadingFallback />}><PaymentsPage /></Suspense>} />
          {/* RET-WEB-002: Device Activation page */}
          <Route path="devices" element={<Suspense fallback={<PageLoadingFallback />}><DeviceActivationPage /></Suspense>} />
          {/* SM-024: SuperAdmin approval queue pages */}
          {/* GL-WF-033: Wrap admin routes with role check */}
          <Route path="admin/suppliers" element={<AdminRoute><Suspense fallback={<PageLoadingFallback />}><SupplierQueuePage /></Suspense></AdminRoute>} />
          <Route path="admin/products" element={<AdminRoute><Suspense fallback={<PageLoadingFallback />}><ProductQueuePage /></Suspense></AdminRoute>} />
          {/* P2-RD-002: QA page hidden in production */}
          {import.meta.env.DEV && <Route path="_pages" element={<Suspense fallback={<PageLoadingFallback />}><AllPagesPage /></Suspense>} />}
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
