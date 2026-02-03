import { useState } from 'react';
import { Outlet, useParams, useNavigate, useLocation } from 'react-router-dom';
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

  // GL-WF-033: Check if user has admin role
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin' || user?.role === 'owner';

  // DEPLOY-003: Use gateway base URL from env
  const getApiBaseUrl = () => {
    return (API_GATEWAY_BASE || window.location.origin) + API_BASE_URL;
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

          {/* SM-024: Admin Section Divider - GL-WF-033: Only show for admin users */}
          {isAdmin && (
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
              {adminNavItems.map((item) => (
                <a
                  key={item.path}
                  href={`/s/${storeCode}/${item.path}`}
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
                </a>
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

        {/* Debug Footer - Fixed at bottom */}
        <footer style={{
          padding: '0.6rem 2rem',
          background: '#0f172a',
          color: '#64748b',
          fontSize: '0.7rem',
          display: 'flex',
          gap: '2rem',
          borderTop: '1px solid #1e293b',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{ display: 'flex', gap: '2rem' }}>
            <span>StoreCode: <strong style={{ color: '#38bdf8' }}>{storeCode}</strong></span>
            <span>StoreId: <strong style={{ color: '#38bdf8' }}>{store?.id || '...'}</strong></span>
            <span>API: <strong style={{ color: '#38bdf8' }}>{window.location.hostname === 'localhost' ? 'http://localhost:3000' : window.location.origin}</strong></span>
          </div>
          {/* RET-AUD-005: Build fingerprint for deployment verification */}
          <BuildStamp />
        </footer>
      </div>

      {/* GL-WF-028: Session Expiry Warning Modal */}
      {showSessionWarning && (
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
