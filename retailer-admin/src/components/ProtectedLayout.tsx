import { useState, useEffect } from 'react';
import { Link, Outlet, useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { API_GATEWAY_BASE } from '../lib/api';
// FLOW-001: Device Required Banner
import DeviceRequiredBanner from './DeviceRequiredBanner';
// REG-AUTH-301: LIMITED MODE Banner
import LimitedModeBanner from './LimitedModeBanner';
// RET-AUD-005: Build fingerprint in UI footer
import BuildStamp from './BuildStamp';

// A1: RouterDebug banner - shows routing info for debugging "no screens" issues
const API_BASE_URL = '/api/v1/retailer-admin';

export default function ProtectedLayout() {
  const { storeCode } = useParams<{ storeCode: string }>();
  const { logout, store, user, showSessionWarning, dismissSessionWarning, isLimitedMode, applicationStatus } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // GL-WF-053: Logout confirmation state
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // #184.25: Escape key handler for session warning and logout modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showLogoutConfirm) setShowLogoutConfirm(false);
        else if (showSessionWarning) dismissSessionWarning();
      }
    };
    if (showSessionWarning || showLogoutConfirm) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [showSessionWarning, showLogoutConfirm, dismissSessionWarning]);

  // GL-WF-033: Check if user has admin role
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin' || user?.role === 'owner';

  // DEPLOY-003: Use gateway base URL from env
  const getApiBaseUrl = () => {
    return (API_GATEWAY_BASE || window.location.origin) + API_BASE_URL;
  };

  const handleLogout = () => {
    logout();
    navigate('/retailer/login');  // STAGING-FIX-008: Route to public login page
  };

  // RET-003: Exact segment match — prevent double-highlight (settings vs settings/payments)
  // Check if a more-specific sibling nav path matches before highlighting parent
  const allPaths = [
    '', 'products', 'inventory', 'suppliers', 'supplier-catalog', 'import',
    'compliance', 'settings', 'settings/payments', 'devices',
    'admin/suppliers', 'admin/products',
  ];
  const isActive = (path: string) => {
    if (path === '') {
      return location.pathname === `/s/${storeCode}` || location.pathname === `/s/${storeCode}/`;
    }
    const full = `/s/${storeCode}/${path}`;
    if (location.pathname === full) return true;
    // Only allow startsWith match if no longer (more-specific) sibling path also matches
    if (location.pathname.startsWith(full + '/')) {
      const hasMoreSpecific = allPaths.some(
        p => p !== path && p.startsWith(path + '/') &&
          (location.pathname === `/s/${storeCode}/${p}` || location.pathname.startsWith(`/s/${storeCode}/${p}/`))
      );
      return !hasMoreSpecific;
    }
    return false;
  };

  const navItems = [
    { path: '', label: 'Dashboard', icon: '📊' },
    { path: 'products', label: 'Products', icon: '📦' },
    { path: 'inventory', label: 'Inventory', icon: '📋' },
    { path: 'suppliers', label: 'Suppliers', icon: '🏪' },
    { path: 'supplier-catalog', label: 'Supplier Catalog', icon: '🛒' }, // CA-1.4-001
    { path: 'import', label: 'Import CSV', icon: '📄' },
    { path: 'compliance', label: 'Compliance', icon: '📑' },
    { path: 'settings', label: 'Settings', icon: '⚙️' }, // GL-RJ-005
    { path: 'settings/payments', label: 'Payments', icon: '💳' }, // RET-WEB-003
    { path: 'devices', label: 'Devices', icon: '📱' }, // RET-WEB-002
  ];

  // SM-024: Admin approval queue navigation
  const adminNavItems = [
    { path: 'admin/suppliers', label: 'Supplier Queue', icon: '✅' },
    { path: 'admin/products', label: 'Product Queue', icon: '📝' },
  ];

  // AUDIT-RET-057: Filter navigation in limited mode — only allow dashboard and settings
  const limitedAllowedPaths = new Set(['', 'settings', 'devices']);
  const visibleNavItems = isLimitedMode
    ? navItems.filter((item) => limitedAllowedPaths.has(item.path))
    : navItems;
  const visibleAdminItems = isLimitedMode ? [] : adminNavItems;

  // STBT-187.6: Route guard — redirect limited-mode users who navigate directly to restricted URLs
  useEffect(() => {
    if (!isLimitedMode || !storeCode) return;
    const basePath = `/s/${storeCode}`;
    const relativePath = location.pathname.replace(basePath, '').replace(/^\//, '');
    // Allow empty (dashboard), 'settings', 'settings/*', 'devices'
    const isAllowed = relativePath === '' || relativePath === 'settings' ||
      relativePath.startsWith('settings/') || relativePath === 'devices';
    if (!isAllowed) {
      navigate(basePath, { replace: true });
    }
  }, [isLimitedMode, location.pathname, storeCode, navigate]);

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
          {/* AUDIT-RET-015: Use Link for SPA navigation instead of <a> full reloads */}
          {visibleNavItems.map((item) => (
            <Link
              key={item.path}
              to={`/s/${storeCode}${item.path ? `/${item.path}` : ''}`}
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
            </Link>
          ))}

          {/* SM-024: Admin Section Divider - GL-WF-033: Only show for admin users */}
          {isAdmin && visibleAdminItems.length > 0 && (
            <div style={{
              borderTop: '1px solid rgba(255,255,255,0.1)',
              margin: '0.75rem 0',
              paddingTop: '0.75rem',
            }}>
              <div style={{
                fontSize: '0.7rem',
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                padding: '0 1rem',
                marginBottom: '0.5rem',
              }}>
                SuperAdmin
              </div>
              {visibleAdminItems.map((item) => (
                <Link
                  key={item.path}
                  to={`/s/${storeCode}/${item.path}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.875rem 1rem',
                    color: 'white',
                    textDecoration: 'none',
                    borderRadius: '10px',
                    background: isActive(item.path)
                      ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(236, 72, 153, 0.2))'
                      : 'transparent',
                    border: isActive(item.path)
                      ? '1px solid rgba(139, 92, 246, 0.3)'
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
                </Link>
              ))}
            </div>
          )}
        </nav>

        {/* Footer */}
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid rgba(255,255,255,0.1)',
        }}>
          {/* GL-WF-053: Logout button with confirmation */}
          <button
            onClick={() => setShowLogoutConfirm(true)}
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
        {/* AUDIT-RET-014: Gate debug banner behind DEV — exposes API URLs in production */}
        {import.meta.env.DEV && (
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
        )}

        {/* FLOW-001: Device Required Banner - shows when no device bound */}
        <DeviceRequiredBanner />

        {/* REG-AUTH-301: LIMITED MODE Banner - shows when user status is not ACTIVE */}
        {isLimitedMode && applicationStatus && (
          <div style={{ padding: '0 2rem', paddingTop: '1rem' }}>
            <LimitedModeBanner status={applicationStatus} storeName={store?.name} />
          </div>
        )}

        {/* Main Content */}
        <main style={{ flex: 1, overflow: 'auto' }}>
          <Outlet />
        </main>

        {/* T-020: Standardized footer — copyright + build stamp (all environments) */}
        <footer style={{
          padding: '0.6rem 2rem',
          background: '#f8fafc',
          color: '#94a3b8',
          fontSize: '0.75rem',
          display: 'flex',
          borderTop: '1px solid #e2e8f0',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span>&copy; 2026 SuperManditech. All rights reserved.</span>
          <BuildStamp />
        </footer>
      </div>

      {/* GL-WF-028: Session Expiry Warning Modal */}
      {/* #184.25: Click-outside dismisses modal */}
      {showSessionWarning && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
        }} onClick={dismissSessionWarning}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '2rem',
            maxWidth: '400px',
            boxShadow: '0 25px 50px rgba(0, 0, 0, 0.25)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem', textAlign: 'center' }}>⏰</div>
            <h3 style={{ margin: '0 0 1rem', textAlign: 'center', color: '#1e293b' }}>Session Expiring Soon</h3>
            <p style={{ margin: '0 0 1.5rem', color: '#64748b', textAlign: 'center' }}>
              Your session will expire in less than 5 minutes due to inactivity. Click below to stay logged in.
            </p>
            <button
              onClick={dismissSessionWarning}
              style={{
                width: '100%',
                padding: '0.875rem',
                background: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Stay Logged In
            </button>
          </div>
        </div>
      )}

      {/* GL-WF-053: Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
        }}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '2rem',
            maxWidth: '400px',
            boxShadow: '0 25px 50px rgba(0, 0, 0, 0.25)',
          }}>
            <h3 style={{ margin: '0 0 1rem', textAlign: 'center', color: '#1e293b' }}>Confirm Logout</h3>
            <p style={{ margin: '0 0 1.5rem', color: '#64748b', textAlign: 'center' }}>
              Are you sure you want to logout?
            </p>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                onClick={() => setShowLogoutConfirm(false)}
                style={{
                  flex: 1,
                  padding: '0.875rem',
                  background: '#f1f5f9',
                  color: '#475569',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: '500',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                style={{
                  flex: 1,
                  padding: '0.875rem',
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
