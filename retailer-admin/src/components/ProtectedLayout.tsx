import { Outlet, useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

// A1: RouterDebug banner - shows routing info for debugging "no screens" issues
const API_BASE_URL = '/api/v1/retailer-admin';

export default function ProtectedLayout() {
  const { storeCode } = useParams<{ storeCode: string }>();
  const { logout, store } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Compute actual API base URL based on environment
  const getApiBaseUrl = () => {
    if (typeof window !== 'undefined') {
      // In dev mode with Vite proxy, API calls go to /api which proxies to backend
      // In production, use same origin
      return window.location.hostname === 'localhost'
        ? 'http://34.14.220.171:3000' + API_BASE_URL
        : window.location.origin + API_BASE_URL;
    }
    return API_BASE_URL;
  };

  const handleLogout = () => {
    logout();
    navigate(`/s/${storeCode}/login`);
  };

  // Check if current path matches nav item
  const isActive = (path: string) => {
    if (path === '') {
      return location.pathname === `/s/${storeCode}` || location.pathname === `/s/${storeCode}/`;
    }
    return location.pathname.startsWith(`/s/${storeCode}/${path}`);
  };

  const navItems = [
    { path: '', label: 'Dashboard', icon: '📊' },
    { path: 'products', label: 'Products', icon: '📦' },
    { path: 'inventory', label: 'Inventory', icon: '📋' },
    { path: 'suppliers', label: 'Suppliers', icon: '🏪' },
    { path: 'import', label: 'Import CSV', icon: '📄' },
    { path: 'compliance', label: 'Compliance', icon: '📑' },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f1f5f9' }}>
      {/* Sidebar */}
      <aside style={{
        width: '240px',
        background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '4px 0 20px rgba(0,0,0,0.1)',
      }}>
        {/* Brand Header */}
        <div style={{
          padding: '1.75rem 1.5rem',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}>
          <div style={{
            fontWeight: '800',
            fontSize: '1.5rem',
            background: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '-0.5px',
          }}>
            SuperMandi
          </div>
          <div style={{
            fontSize: '0.8rem',
            color: '#94a3b8',
            marginTop: '0.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              background: '#22c55e',
              borderRadius: '50%',
              display: 'inline-block',
            }}></span>
            {store?.name || storeCode}
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {navItems.map((item) => (
            <a
              key={item.path}
              href={`/s/${storeCode}${item.path ? `/${item.path}` : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.875rem 1rem',
                color: 'white',
                textDecoration: 'none',
                borderRadius: '10px',
                background: isActive(item.path)
                  ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(6, 182, 212, 0.2))'
                  : 'transparent',
                border: isActive(item.path)
                  ? '1px solid rgba(59, 130, 246, 0.3)'
                  : '1px solid transparent',
                fontWeight: isActive(item.path) ? '500' : '400',
                fontSize: '0.95rem',
                transition: 'all 0.2s',
                opacity: isActive(item.path) ? 1 : 0.7,
              }}
              onMouseOver={(e) => {
                if (!isActive(item.path)) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                  e.currentTarget.style.opacity = '1';
                }
              }}
              onMouseOut={(e) => {
                if (!isActive(item.path)) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.opacity = '0.7';
                }
              }}
            >
              <span style={{ fontSize: '1.1rem' }}>{item.icon}</span>
              {item.label}
            </a>
          ))}
        </nav>

        {/* Footer */}
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid rgba(255,255,255,0.1)',
        }}>
          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '8px',
              color: '#fca5a5',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: '500',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
              e.currentTarget.style.color = '#fecaca';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
              e.currentTarget.style.color = '#fca5a5';
            }}
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {/* A1: RouterDebug Banner - top-right debug info */}
        <div style={{
          position: 'fixed',
          top: '0.5rem',
          right: '0.5rem',
          background: 'rgba(15, 23, 42, 0.95)',
          color: '#94a3b8',
          padding: '0.5rem 0.75rem',
          borderRadius: '8px',
          fontSize: '0.65rem',
          fontFamily: 'monospace',
          zIndex: 9999,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          border: '1px solid #334155',
          maxWidth: '300px',
        }}>
          <div style={{ color: '#22c55e', fontWeight: '600', marginBottom: '0.25rem' }}>RouterDebug</div>
          <div><span style={{ color: '#64748b' }}>path:</span> <span style={{ color: '#38bdf8' }}>{location.pathname}</span></div>
          <div><span style={{ color: '#64748b' }}>store:</span> <span style={{ color: '#a78bfa' }}>{storeCode}</span></div>
          <div><span style={{ color: '#64748b' }}>api:</span> <span style={{ color: '#fbbf24', wordBreak: 'break-all' }}>{getApiBaseUrl()}</span></div>
        </div>

        {/* Main Content */}
        <main style={{ flex: 1, overflow: 'auto' }}>
          <Outlet />
        </main>

        {/* Debug Footer - Fixed at bottom */}
        <footer style={{
          padding: '0.6rem 2rem',
          background: '#0f172a',
          color: '#64748b',
          fontSize: '0.7rem',
          display: 'flex',
          gap: '2rem',
          borderTop: '1px solid #1e293b',
        }}>
          <span>StoreCode: <strong style={{ color: '#38bdf8' }}>{storeCode}</strong></span>
          <span>StoreId: <strong style={{ color: '#38bdf8' }}>{store?.id || '...'}</strong></span>
          <span>API: <strong style={{ color: '#38bdf8' }}>{window.location.hostname === 'localhost' ? 'http://localhost:3000' : window.location.origin}</strong></span>
        </footer>
      </div>
    </div>
  );
}
