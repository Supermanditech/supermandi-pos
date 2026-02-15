import { useState, useEffect } from 'react';
import { Link, Outlet, useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { API_GATEWAY_BASE } from '../lib/api';
// T-081: Lucide SVG icons for navigation
// T-088: Menu/X icons for mobile hamburger
import { LayoutDashboard, Package, ClipboardList, Store, ShoppingCart, FileText, FileSpreadsheet, Settings, CreditCard, Smartphone, Receipt, CheckCircle, PenSquare, Menu, X, type LucideIcon } from 'lucide-react';
// FLOW-001: Device Required Banner
import DeviceRequiredBanner from './DeviceRequiredBanner';
// REG-AUTH-301: LIMITED MODE Banner
import LimitedModeBanner from './LimitedModeBanner';
// RET-AUD-005: Build fingerprint in UI footer
import BuildStamp from './BuildStamp';
// T-091: Shared Modal component
import Modal from './Modal';

// A1: RouterDebug banner - shows routing info for debugging "no screens" issues
const API_BASE_URL = '/api/v1/retailer-admin';

export default function ProtectedLayout() {
  const { storeCode } = useParams<{ storeCode: string }>();
  const { logout, store, user, showSessionWarning, dismissSessionWarning, isLimitedMode, applicationStatus } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // GL-WF-053: Logout confirmation state
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  // T-088: Mobile hamburger sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768);

  // T-088: Track viewport width for mobile detection
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setSidebarOpen(false); // close sidebar when resizing to desktop
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // #184.25: Escape key handling moved to Modal component (T-091)

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

  // T-081: Lucide SVG icons replace emoji icons
  const navItems: { path: string; label: string; icon: LucideIcon }[] = [
    { path: '', label: 'Dashboard', icon: LayoutDashboard },
    { path: 'products', label: 'Products', icon: Package },
    { path: 'inventory', label: 'Inventory', icon: ClipboardList },
    { path: 'suppliers', label: 'Suppliers', icon: Store },
    { path: 'supplier-catalog', label: 'Supplier Catalog', icon: ShoppingCart }, // CA-1.4-001
    { path: 'import', label: 'Import CSV', icon: FileText },
    { path: 'compliance', label: 'Compliance', icon: FileSpreadsheet },
    { path: 'settings', label: 'Settings', icon: Settings }, // GL-RJ-005
    { path: 'settings/payments', label: 'Payments', icon: CreditCard }, // RET-WEB-003
    { path: 'devices', label: 'Devices', icon: Smartphone }, // RET-WEB-002
    { path: 'invoices', label: 'Invoices', icon: Receipt }, // T-073
  ];

  // SM-024: Admin approval queue navigation
  const adminNavItems: { path: string; label: string; icon: LucideIcon }[] = [
    { path: 'admin/suppliers', label: 'Supplier Queue', icon: CheckCircle },
    { path: 'admin/products', label: 'Product Queue', icon: PenSquare },
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
    <div className="layout-wrapper">
      {/* T-088: Mobile hamburger button — visible only on mobile */}
      {isMobile && !sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
          style={{
            position: 'fixed',
            top: 16,
            left: 16,
            zIndex: 40,
            width: 40,
            height: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <Menu style={{ width: 22, height: 22, color: '#1e293b' }} />
        </button>
      )}

      {/* T-088: Mobile backdrop overlay */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            zIndex: 45,
          }}
        />
      )}

      {/* T-089: Sidebar — refactored to CSS classes */}
      <aside
        className="sidebar-dark"
        style={{
          display: isMobile && !sidebarOpen ? 'none' : 'flex',
          // T-088: Mobile fixed overlay positioning
          ...(isMobile && sidebarOpen ? {
            position: 'fixed' as const,
            top: 0,
            bottom: 0,
            left: 0,
            zIndex: 50,
          } : {}),
        }}
      >
        {/* Brand Header */}
        <div className="sidebar-brand">
          {/* Top row: brand + mobile close */}
          <div className="sidebar-brand-row">
            {/* T-084: Brand logo + plain white text replaces gradient text */}
            <div className="sidebar-brand-logo">
              <img src="/retailer/brand/logo-white.svg" alt="" width={24} height={24} />
              <span className="sidebar-brand-name">SuperMandi</span>
            </div>
            {/* T-088: Close button for mobile sidebar */}
            {isMobile && (
              <button
                onClick={() => setSidebarOpen(false)}
                aria-label="Close menu"
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X style={{ width: 22, height: 22, color: '#94a3b8' }} />
              </button>
            )}
          </div>
          {/* Store name indicator */}
          <div className="sidebar-store-indicator">
            <span className="sidebar-store-dot"></span>
            {store?.name || storeCode}
          </div>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav-section">
          {/* AUDIT-RET-015: Use Link for SPA navigation instead of <a> full reloads */}
          {visibleNavItems.map((item) => (
            <Link
              key={item.path}
              to={`/s/${storeCode}${item.path ? `/${item.path}` : ''}`}
              onClick={() => isMobile && setSidebarOpen(false)}
              className={`sidebar-nav-link${isActive(item.path) ? ' active' : ''}`}
            >
              {/* T-081: Lucide SVG icon */}
              <item.icon className="sidebar-nav-icon" />
              {item.label}
            </Link>
          ))}

          {/* SM-024: Admin Section Divider - GL-WF-033: Only show for admin users */}
          {isAdmin && visibleAdminItems.length > 0 && (
            <div className="sidebar-admin-divider">
              <div className="sidebar-admin-label">
                SuperAdmin
              </div>
              {visibleAdminItems.map((item) => (
                <Link
                  key={item.path}
                  to={`/s/${storeCode}/${item.path}`}
                  onClick={() => isMobile && setSidebarOpen(false)}
                  className={`sidebar-nav-link admin-link${isActive(item.path) ? ' active' : ''}`}
                >
                  {/* T-081: Lucide SVG icon */}
                  <item.icon className="sidebar-nav-icon" />
                  {item.label}
                </Link>
              ))}
            </div>
          )}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer-section">
          {/* GL-WF-053: Logout button with confirmation */}
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="sidebar-logout-btn"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <div className="layout-main">
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

        {/* T-097: Unified footer — standard text + BuildStamp */}
        <footer style={{ padding: '12px 24px', background: '#F8FAFC', color: '#94A3B8', fontSize: '12px', display: 'flex', borderTop: '1px solid #E2E8F0', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>&copy; 2026 SuperMandi Tech Pvt Ltd &middot; Made in India</span>
          <BuildStamp />
        </footer>
      </div>

      {/* GL-WF-028: Session Expiry Warning Modal — T-091: Uses shared Modal component */}
      {/* #184.25: Click-outside dismisses modal */}
      <Modal
        isOpen={showSessionWarning}
        onClose={dismissSessionWarning}
        title="Session Expiring Soon"
        actions={
          <button onClick={dismissSessionWarning} className="modal-btn modal-btn-primary">
            Stay Logged In
          </button>
        }
      >
        <div style={{ fontSize: '2rem', marginBottom: '1rem', textAlign: 'center' }}>&#9200;</div>
        <p className="modal-body">
          Your session will expire in less than 5 minutes due to inactivity. Click below to stay logged in.
        </p>
      </Modal>

      {/* GL-WF-053: Logout Confirmation Modal — T-091: Uses shared Modal component */}
      <Modal
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        title="Confirm Logout"
        actions={
          <div className="modal-actions">
            <button onClick={() => setShowLogoutConfirm(false)} className="modal-btn modal-btn-cancel">
              Cancel
            </button>
            <button onClick={handleLogout} className="modal-btn modal-btn-danger">
              Logout
            </button>
          </div>
        }
      >
        <p className="modal-body">
          Are you sure you want to logout?
        </p>
      </Modal>
    </div>
  );
}
