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
import CompliancePage from './pages/CompliancePage';
import AllPagesPage from './pages/AllPagesPage';

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
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        Loading...
      </div>
    );
  }

  if (!isAuthenticated) {
    // Extract storeCode from current path
    const match = location.pathname.match(/^\/s\/([^/]+)/);
    const storeCode = match ? match[1] : 'DEMO001';
    // Redirect to login, preserving the intended destination
    return <Navigate to={`/s/${storeCode}/login`} state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <>
      <TrailingSlashRedirect />
      <Routes>
        {/* Root redirect */}
        <Route path="/" element={<Navigate to="/s/DEMO001" replace />} />

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
          <Route path="compliance" element={<CompliancePage />} />
          <Route path="_pages" element={<AllPagesPage />} />
        </Route>

        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/s/DEMO001" replace />} />
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
