import { Outlet, NavLink, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { fetchStore } from '../api/store';

export default function ProtectedLayout() {
  const { storeCode } = useParams<{ storeCode: string }>();
  const { logout, accessToken, store: authStore } = useAuth();
  const navigate = useNavigate();

  // Fetch store info
  const { data: storeData } = useQuery({
    queryKey: ['store', storeCode],
    queryFn: () => fetchStore(accessToken!),
    enabled: !!accessToken,
  });

  const store = storeData?.data || authStore;

  // SECURITY: Verify URL storeCode matches authenticated store
  // This prevents users from accessing other stores by changing the URL
  const isStoreCodeMismatch = store?.code && storeCode &&
    store.code.toUpperCase() !== storeCode.toUpperCase();

  const handleLogout = () => {
    logout();
    navigate(`/s/${storeCode}/login`);
  };

  const navItems = [
    { path: '', label: 'Dashboard', icon: '📊' },
    { path: 'products', label: 'Products', icon: '📦' },
    { path: 'import', label: 'Import (CSV)', icon: '📥' },
    { path: 'inventory', label: 'Inventory', icon: '📋' },
    { path: 'suppliers', label: 'Suppliers', icon: '🏭' },
    { path: 'compliance', label: 'Compliance', icon: '📄' },
  ];

  const apiBaseUrl = window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : `${window.location.protocol}//${window.location.host}`;

  // SECURITY: Show 403 if URL storeCode doesn't match authenticated store
  if (isStoreCodeMismatch) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: '#fef2f2',
        padding: '2rem',
      }}>
        <div style={{
          background: 'white',
          padding: '2.5rem',
          borderRadius: '1rem',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          maxWidth: '400px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🚫</div>
          <h1 style={{ color: '#991b1b', marginBottom: '0.5rem', fontSize: '1.5rem' }}>
            403 - Access Denied
          </h1>
          <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
            You do not have access to store <strong>{storeCode}</strong>.
            <br />
            Your account is linked to store <strong>{store?.code}</strong>.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button
              onClick={() => navigate(`/s/${store?.code}`)}
              className="btn btn-primary"
            >
              Go to {store?.code}
            </button>
            <button onClick={handleLogout} className="btn btn-secondary">
              Logout
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">SuperMandi</div>
          <div className="sidebar-store">{store?.name || storeCode}</div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={`/s/${storeCode}/${item.path}`}
              end={item.path === ''}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}

          {/* QA Pages Link */}
          <NavLink
            to={`/s/${storeCode}/_pages`}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}
          >
            <span className="nav-icon">🧪</span>
            All Pages (QA)
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <button onClick={handleLogout} className="btn btn-secondary" style={{ width: '100%' }}>
            🚪 Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <Outlet />

        {/* Debug Footer */}
        <footer className="debug-footer">
          <div className="debug-item">
            <span className="debug-label">StoreCode:</span>
            <span className="debug-value">{storeCode}</span>
          </div>
          <div className="debug-item">
            <span className="debug-label">StoreId:</span>
            <span className="debug-value">{store?.id || 'loading...'}</span>
          </div>
          <div className="debug-item">
            <span className="debug-label">API:</span>
            <span className="debug-value">{apiBaseUrl}</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
