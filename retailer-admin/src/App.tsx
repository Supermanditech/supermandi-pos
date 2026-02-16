import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import React, { useEffect, Suspense, lazy } from 'react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { FeatureFlagProvider } from './lib/FeatureFlagContext';
import ProtectedLayout from './components/ProtectedLayout';
// ISSUE-MICRO-105: Global error boundary
import { ErrorBoundary } from './components/ErrorBoundary';
// T-094: Standardized toast notifications
import { Toaster } from 'react-hot-toast';

// RET-AUD-048: Lazy load pages for code splitting and better performance at scale
// Critical auth pages loaded eagerly for fast initial load
import LoginPage from './pages/LoginPage';
// RO-003: Simplified instant registration (replaces old 4-step onboarding flow)
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
// AUDIT-RET-002: Removed deprecated RetailerOnboardingPage lazy import — redirects to RegisterPage

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
const InvoicesPage = lazy(() => import('./pages/InvoicesPage'));  // T-073
const ReconciliationPage = lazy(() => import('./pages/ReconciliationPage'));  // T-151
const CreditDashboardPage = lazy(() => import('./pages/CreditDashboardPage'));  // T-277
const ChatPage = lazy(() => import('./pages/ChatPage'));  // T-294
const PurchaseOrdersPage = lazy(() => import('./pages/PurchaseOrdersPage'));  // T-180
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));  // T-212
const CustomersPage = lazy(() => import('./pages/CustomersPage'));  // T-218
const ReorderPage = lazy(() => import('./pages/ReorderPage'));  // T-230
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));  // Phase 8: Notifications
// RET-CLEANUP-001: Forgot password page
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
// SM-024: Admin approval queue pages
const SupplierQueuePage = lazy(() => import('./pages/admin/SupplierQueuePage'));
const ProductQueuePage = lazy(() => import('./pages/admin/ProductQueuePage'));
// T-115: Branded 404 page
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

// RET-AUD-048 + ISSUE-MICRO-106: Skeleton loading fallback for Suspense boundaries
const PageLoadingFallback = () => (
  <div style={{ padding: '1.5rem' }}>
    <div style={{ height: 24, width: '40%', background: '#e2e8f0', borderRadius: 6, marginBottom: 16, animation: 'pulse 1.5s ease-in-out infinite' }} />
    <div style={{ height: 16, width: '60%', background: '#e2e8f0', borderRadius: 6, marginBottom: 24, animation: 'pulse 1.5s ease-in-out infinite' }} />
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{ height: 100, background: '#f1f5f9', borderRadius: 12, animation: 'pulse 1.5s ease-in-out infinite' }} />
      ))}
    </div>
    <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
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

// RET-004: Limited mode route guard — blocks access to restricted routes when application not ACTIVE
// Allowed paths in limited mode: dashboard (index), settings, devices
function LimitedModeGuard({ children }: { children: React.ReactNode }) {
  const { isLimitedMode, store } = useAuth();
  const location = useLocation();

  if (!isLimitedMode) return <>{children}</>;

  // Extract the sub-path after /s/:storeCode/
  const match = location.pathname.match(/^\/s\/[^/]+\/(.+)/);
  const subPath = match?.[1] || '';

  // Allowed sub-paths in limited mode
  const limitedAllowed = new Set(['', 'settings', 'devices']);
  if (!limitedAllowed.has(subPath)) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        alignItems: 'center', height: '100%', padding: '2rem', textAlign: 'center',
      }}>
        <div style={{
          background: '#fffbeb', border: '1px solid #fde68a',
          borderRadius: '12px', padding: '2rem', maxWidth: '400px',
        }}>
          <h2 style={{ color: '#92400e', marginBottom: '0.5rem' }}>Feature Unavailable</h2>
          <p style={{ color: '#a16207', marginBottom: '1.5rem' }}>
            This feature is not available until your store application is approved.
          </p>
          <a href={`/s/${store?.code || ''}`} style={{
            display: 'inline-block', padding: '0.75rem 1.5rem', background: '#3b82f6',
            color: 'white', borderRadius: '8px', textDecoration: 'none', fontWeight: '500',
          }}>Go to Dashboard</a>
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
        {/* RO-003: /retailer/register → instant registration (no application flow) */}
        <Route path="/retailer/register" element={<Suspense fallback={<PageLoadingFallback />}><RegisterPage /></Suspense>} />
        {/* AUDIT-RET-002: Redirect deprecated onboard to register */}
        <Route path="/retailer/onboard" element={<Navigate to="/retailer/register" replace />} />
        {/* RET-CLEANUP-001: Forgot password page - accessible without auth */}
        <Route path="/retailer/forgot-password" element={<Suspense fallback={<PageLoadingFallback />}><ForgotPasswordPage /></Suspense>} />

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
          {/* RET-004: All child routes wrapped with LimitedModeGuard — blocks restricted routes when not ACTIVE */}
          <Route index element={<Suspense fallback={<PageLoadingFallback />}><DashboardPage /></Suspense>} />
          <Route path="products" element={<LimitedModeGuard><Suspense fallback={<PageLoadingFallback />}><ProductsPage /></Suspense></LimitedModeGuard>} />
          <Route path="import" element={<LimitedModeGuard><Suspense fallback={<PageLoadingFallback />}><ImportPage /></Suspense></LimitedModeGuard>} />
          <Route path="inventory" element={<LimitedModeGuard><Suspense fallback={<PageLoadingFallback />}><InventoryPage /></Suspense></LimitedModeGuard>} />
          <Route path="suppliers" element={<LimitedModeGuard><Suspense fallback={<PageLoadingFallback />}><SuppliersPage /></Suspense></LimitedModeGuard>} />
          {/* CA-1.4-001: Supplier Catalog - browse and add approved products */}
          <Route path="supplier-catalog" element={<LimitedModeGuard><Suspense fallback={<PageLoadingFallback />}><SupplierCatalogPage /></Suspense></LimitedModeGuard>} />
          <Route path="compliance" element={<LimitedModeGuard><Suspense fallback={<PageLoadingFallback />}><CompliancePage /></Suspense></LimitedModeGuard>} />
          {/* GL-RJ-005: Store Settings page — allowed in limited mode */}
          <Route path="settings" element={<Suspense fallback={<PageLoadingFallback />}><SettingsPage /></Suspense>} />
          {/* RET-WEB-003: Payments Setup page */}
          <Route path="settings/payments" element={<LimitedModeGuard><Suspense fallback={<PageLoadingFallback />}><PaymentsPage /></Suspense></LimitedModeGuard>} />
          {/* T-073: Invoices page */}
          <Route path="invoices" element={<LimitedModeGuard><Suspense fallback={<PageLoadingFallback />}><InvoicesPage /></Suspense></LimitedModeGuard>} />
          {/* T-151: Payment Reconciliation Dashboard */}
          <Route path="reconciliation" element={<LimitedModeGuard><Suspense fallback={<PageLoadingFallback />}><ReconciliationPage /></Suspense></LimitedModeGuard>} />
          {/* T-277: Credit & Finance Dashboard */}
          <Route path="credit" element={<LimitedModeGuard><Suspense fallback={<PageLoadingFallback />}><CreditDashboardPage /></Suspense></LimitedModeGuard>} />
          <Route path="chat" element={<LimitedModeGuard><Suspense fallback={<PageLoadingFallback />}><ChatPage /></Suspense></LimitedModeGuard>} />
          {/* T-180: Purchase Orders Visibility */}
          <Route path="purchase-orders" element={<LimitedModeGuard><Suspense fallback={<PageLoadingFallback />}><PurchaseOrdersPage /></Suspense></LimitedModeGuard>} />
          {/* T-212: Sales Analytics Dashboard */}
          <Route path="analytics" element={<LimitedModeGuard><Suspense fallback={<PageLoadingFallback />}><AnalyticsPage /></Suspense></LimitedModeGuard>} />
          <Route path="customers" element={<LimitedModeGuard><Suspense fallback={<PageLoadingFallback />}><CustomersPage /></Suspense></LimitedModeGuard>} />
          <Route path="reorder" element={<LimitedModeGuard><Suspense fallback={<PageLoadingFallback />}><ReorderPage /></Suspense></LimitedModeGuard>} />
          {/* Phase 8: Notifications center */}
          <Route path="notifications" element={<LimitedModeGuard><Suspense fallback={<PageLoadingFallback />}><NotificationsPage /></Suspense></LimitedModeGuard>} />
          {/* RET-WEB-002: Device Activation page — allowed in limited mode */}
          <Route path="devices" element={<Suspense fallback={<PageLoadingFallback />}><DeviceActivationPage /></Suspense>} />
          {/* SM-024: SuperAdmin approval queue pages */}
          {/* GL-WF-033: Wrap admin routes with role check + RET-004: limited mode guard */}
          <Route path="admin/suppliers" element={<LimitedModeGuard><AdminRoute><Suspense fallback={<PageLoadingFallback />}><SupplierQueuePage /></Suspense></AdminRoute></LimitedModeGuard>} />
          <Route path="admin/products" element={<LimitedModeGuard><AdminRoute><Suspense fallback={<PageLoadingFallback />}><ProductQueuePage /></Suspense></AdminRoute></LimitedModeGuard>} />
          {/* P2-RD-002: QA page hidden in production */}
          {import.meta.env.DEV && <Route path="_pages" element={<Suspense fallback={<PageLoadingFallback />}><AllPagesPage /></Suspense>} />}
          {/* T-115: Store-scoped 404 — catches unknown paths under /s/:storeCode */}
          <Route path="*" element={<Suspense fallback={<PageLoadingFallback />}><NotFoundPage /></Suspense>} />
        </Route>

        {/* T-115: Branded 404 catch-all — replaces blind redirect to / */}
        <Route path="*" element={<Suspense fallback={<PageLoadingFallback />}><NotFoundPage /></Suspense>} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <FeatureFlagProvider>
          <AppRoutes />
        </FeatureFlagProvider>
      </AuthProvider>
      {/* T-094: Standardized toast config per DESIGN_TOKENS.md */}
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#0F172A',
            color: '#FFFFFF',
            borderRadius: '8px',
          },
          success: {
            duration: 4000,
          },
          error: {
            duration: 6000,
          },
        }}
      />
    </ErrorBoundary>
  );
}
