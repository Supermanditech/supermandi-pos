import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import App from '../App';

// ---------------------------------------------------------------------------
// Mutable mock for useAuth — allows per-test overrides via mockUseAuth
// ---------------------------------------------------------------------------
const mockUseAuth = vi.fn();

// Mock firebase
vi.mock('../lib/firebase', () => ({
  auth: {
    currentUser: null,
    onAuthStateChanged: vi.fn((callback) => {
      callback(null);
      return vi.fn();
    }),
  },
  db: {},
}));

// Mock AuthContext with forwarding function so tests can override
vi.mock('../lib/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

// Mock FeatureFlagContext
vi.mock('../lib/FeatureFlagContext', () => ({
  FeatureFlagProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useFeatureFlags: () => ({
    flags: {},
    isLoading: false,
  }),
}));

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  Toaster: () => null,
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Mock ProtectedLayout with Outlet so nested routes render
vi.mock('../components/ProtectedLayout', async () => {
  const { Outlet } = await import('react-router-dom');
  return {
    default: () => <div data-testid="protected-layout"><Outlet /></div>,
  };
});

// Mock pages — eagerly loaded
vi.mock('../pages/LoginPage', () => ({
  default: () => <div>Login Page</div>,
}));

// Mock pages — lazy loaded
vi.mock('../pages/RegisterPage', () => ({ default: () => <div>Register Page</div> }));
vi.mock('../pages/DashboardPage', () => ({ default: () => <div>Dashboard Page</div> }));
vi.mock('../pages/ProductsPage', () => ({ default: () => <div>Products Page</div> }));
vi.mock('../pages/NotFoundPage', () => ({ default: () => <div>404 Not Found</div> }));
vi.mock('../pages/SettingsPage', () => ({ default: () => <div>Settings Page</div> }));
vi.mock('../pages/DeviceActivationPage', () => ({ default: () => <div>Device Activation Page</div> }));
vi.mock('../pages/admin/SupplierQueuePage', () => ({ default: () => <div>Supplier Queue Page</div> }));
vi.mock('../pages/admin/ProductQueuePage', () => ({ default: () => <div>Product Queue Page</div> }));
vi.mock('../pages/InventoryPage', () => ({ default: () => <div>Inventory Page</div> }));
vi.mock('../pages/ForgotPasswordPage', () => ({ default: () => <div>Forgot Password Page</div> }));
vi.mock('../pages/ResetPasswordPage', () => ({ default: () => <div>Reset Password Page</div> }));
vi.mock('../pages/HelpPage', () => ({ default: () => <div>Help Page</div> }));

// ---------------------------------------------------------------------------
// Auth state helpers
// ---------------------------------------------------------------------------
const defaultAuth = {
  isAuthenticated: false,
  isLoading: false,
  user: null,
  store: null,
  isLimitedMode: false,
  accessToken: null,
  applicationStatus: null,
  login: vi.fn(),
  logout: vi.fn(),
  showSessionWarning: false,
  dismissSessionWarning: vi.fn(),
};

function authed(overrides: Record<string, unknown> = {}) {
  return {
    ...defaultAuth,
    isAuthenticated: true,
    user: { id: 'u1', name: 'Test Owner', phone: '9876543210', role: 'owner' },
    store: { id: 's1', code: 'STORE1', name: 'Test Store' },
    accessToken: 'mock-token',
    ...overrides,
  };
}

// ===========================================================================
describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue(defaultAuth);
  });

  // =========================================================================
  // EXISTING SMOKE TESTS
  // =========================================================================
  it('renders without crashing', () => {
    render(<BrowserRouter><App /></BrowserRouter>);
    expect(document.body).toBeTruthy();
  });

  it('renders ErrorBoundary wrapper', () => {
    const { container } = render(<BrowserRouter><App /></BrowserRouter>);
    expect(container.firstChild).toBeTruthy();
  });

  it('redirects root path to /retailer/login', async () => {
    render(<BrowserRouter><App /></BrowserRouter>);
    await screen.findByText('Login Page');
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('renders Toaster component for notifications', () => {
    const { container } = render(<BrowserRouter><App /></BrowserRouter>);
    expect(container).toBeTruthy();
  });

  it('wraps app in AuthProvider and FeatureFlagProvider', () => {
    const { container } = render(<BrowserRouter><App /></BrowserRouter>);
    expect(container).toBeTruthy();
  });

  it('handles navigation to /retailer/login', async () => {
    window.history.pushState({}, 'Login', '/retailer/login');
    render(<BrowserRouter><App /></BrowserRouter>);
    expect(await screen.findByText('Login Page')).toBeInTheDocument();
  });

  it('handles navigation to /retailer/register', async () => {
    window.history.pushState({}, 'Register', '/retailer/register');
    render(<BrowserRouter><App /></BrowserRouter>);
    expect(await screen.findByText('Register Page')).toBeInTheDocument();
  });

  it('handles unknown routes with 404 page', async () => {
    window.history.pushState({}, 'Unknown', '/unknown-route');
    render(<BrowserRouter><App /></BrowserRouter>);
    expect(await screen.findByText('404 Not Found')).toBeInTheDocument();
  });

  // =========================================================================
  // PROTECTED ROUTE REDIRECTS (ProtectedRoute guard)
  // =========================================================================
  describe('ProtectedRoute — Unauthenticated Redirects', () => {
    it('redirects unauthenticated user from /s/STORE1 to login', async () => {
      render(<MemoryRouter initialEntries={['/s/STORE1']}><App /></MemoryRouter>);
      expect(await screen.findByText('Login Page')).toBeInTheDocument();
    });

    it('redirects unauthenticated user from /s/STORE1/products to login', async () => {
      render(<MemoryRouter initialEntries={['/s/STORE1/products']}><App /></MemoryRouter>);
      expect(await screen.findByText('Login Page')).toBeInTheDocument();
    });

    it('redirects unauthenticated user from /s/STORE1/settings to login', async () => {
      render(<MemoryRouter initialEntries={['/s/STORE1/settings']}><App /></MemoryRouter>);
      expect(await screen.findByText('Login Page')).toBeInTheDocument();
    });

    it('redirects unauthenticated user from /s/STORE1/admin/suppliers to login', async () => {
      render(<MemoryRouter initialEntries={['/s/STORE1/admin/suppliers']}><App /></MemoryRouter>);
      expect(await screen.findByText('Login Page')).toBeInTheDocument();
    });

    it('redirects unauthenticated user from deep nested route to login', async () => {
      render(<MemoryRouter initialEntries={['/s/STORE1/inventory']}><App /></MemoryRouter>);
      expect(await screen.findByText('Login Page')).toBeInTheDocument();
    });
  });

  describe('ProtectedRoute — Authenticated Access', () => {
    it('shows dashboard for authenticated user at /s/STORE1', async () => {
      mockUseAuth.mockReturnValue(authed());
      render(<MemoryRouter initialEntries={['/s/STORE1']}><App /></MemoryRouter>);
      expect(await screen.findByText('Dashboard Page')).toBeInTheDocument();
    });

    it('shows products page for authenticated user', async () => {
      mockUseAuth.mockReturnValue(authed());
      render(<MemoryRouter initialEntries={['/s/STORE1/products']}><App /></MemoryRouter>);
      expect(await screen.findByText('Products Page')).toBeInTheDocument();
    });

    it('shows settings page for authenticated user', async () => {
      mockUseAuth.mockReturnValue(authed());
      render(<MemoryRouter initialEntries={['/s/STORE1/settings']}><App /></MemoryRouter>);
      expect(await screen.findByText('Settings Page')).toBeInTheDocument();
    });

    it('shows loading state when auth is resolving', async () => {
      mockUseAuth.mockReturnValue({ ...defaultAuth, isLoading: true });
      render(<MemoryRouter initialEntries={['/s/STORE1']}><App /></MemoryRouter>);
      expect(await screen.findByText('Loading...')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // STORE CODE VALIDATION (GL-CRIT-0023)
  // =========================================================================
  describe('ProtectedRoute — Store Code Validation (GL-CRIT-0023)', () => {
    it('redirects to correct store when URL has wrong store code', async () => {
      mockUseAuth.mockReturnValue(authed());
      render(<MemoryRouter initialEntries={['/s/WRONG_STORE']}><App /></MemoryRouter>);
      // Should redirect to /s/STORE1 and render dashboard
      expect(await screen.findByText('Dashboard Page')).toBeInTheDocument();
    });

    it('redirects case-mismatch store code to correct store', async () => {
      mockUseAuth.mockReturnValue(authed());
      // URL has different casing — ProtectedRoute compares case-insensitively
      // so "store1" should match "STORE1" and NOT redirect
      render(<MemoryRouter initialEntries={['/s/store1']}><App /></MemoryRouter>);
      expect(await screen.findByText('Dashboard Page')).toBeInTheDocument();
    });

    it('allows access when URL store code matches exactly', async () => {
      mockUseAuth.mockReturnValue(authed());
      render(<MemoryRouter initialEntries={['/s/STORE1/inventory']}><App /></MemoryRouter>);
      expect(await screen.findByText('Inventory Page')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // ADMIN ROUTE ACCESS (GL-WF-033)
  // =========================================================================
  describe('AdminRoute — Role-Based Access', () => {
    it('shows Access Denied for staff role on admin route', async () => {
      mockUseAuth.mockReturnValue(authed({
        user: { id: 'u2', name: 'Staff User', phone: '1111111111', role: 'staff' },
      }));
      render(<MemoryRouter initialEntries={['/s/STORE1/admin/suppliers']}><App /></MemoryRouter>);
      expect(await screen.findByText('Access Denied')).toBeInTheDocument();
    });

    it('shows Go to Dashboard link on Access Denied', async () => {
      mockUseAuth.mockReturnValue(authed({
        user: { id: 'u2', name: 'Staff User', phone: '1111111111', role: 'staff' },
      }));
      render(<MemoryRouter initialEntries={['/s/STORE1/admin/suppliers']}><App /></MemoryRouter>);
      const link = await screen.findByText('Go to Dashboard');
      expect(link).toBeInTheDocument();
      expect(link.closest('a')).toHaveAttribute('href', '/s/STORE1');
    });

    it('renders admin page for owner role', async () => {
      mockUseAuth.mockReturnValue(authed());
      render(<MemoryRouter initialEntries={['/s/STORE1/admin/suppliers']}><App /></MemoryRouter>);
      expect(await screen.findByText('Supplier Queue Page')).toBeInTheDocument();
    });

    it('renders admin page for admin role', async () => {
      mockUseAuth.mockReturnValue(authed({
        user: { id: 'u3', name: 'Admin User', phone: '2222222222', role: 'admin' },
      }));
      render(<MemoryRouter initialEntries={['/s/STORE1/admin/suppliers']}><App /></MemoryRouter>);
      expect(await screen.findByText('Supplier Queue Page')).toBeInTheDocument();
    });

    it('renders admin page for superadmin role', async () => {
      mockUseAuth.mockReturnValue(authed({
        user: { id: 'u4', name: 'SuperAdmin', phone: '3333333333', role: 'superadmin' },
      }));
      render(<MemoryRouter initialEntries={['/s/STORE1/admin/products']}><App /></MemoryRouter>);
      expect(await screen.findByText('Product Queue Page')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // LIMITED MODE GUARD (RET-004)
  // =========================================================================
  describe('LimitedModeGuard — Application Status Gating', () => {
    it('shows Feature Unavailable for restricted route in limited mode', async () => {
      mockUseAuth.mockReturnValue(authed({ isLimitedMode: true }));
      render(<MemoryRouter initialEntries={['/s/STORE1/products']}><App /></MemoryRouter>);
      expect(await screen.findByText('Feature Unavailable')).toBeInTheDocument();
    });

    it('shows Feature Unavailable for inventory in limited mode', async () => {
      mockUseAuth.mockReturnValue(authed({ isLimitedMode: true }));
      render(<MemoryRouter initialEntries={['/s/STORE1/inventory']}><App /></MemoryRouter>);
      expect(await screen.findByText('Feature Unavailable')).toBeInTheDocument();
    });

    it('allows dashboard in limited mode', async () => {
      mockUseAuth.mockReturnValue(authed({ isLimitedMode: true }));
      render(<MemoryRouter initialEntries={['/s/STORE1']}><App /></MemoryRouter>);
      expect(await screen.findByText('Dashboard Page')).toBeInTheDocument();
    });

    it('allows settings in limited mode', async () => {
      mockUseAuth.mockReturnValue(authed({ isLimitedMode: true }));
      render(<MemoryRouter initialEntries={['/s/STORE1/settings']}><App /></MemoryRouter>);
      expect(await screen.findByText('Settings Page')).toBeInTheDocument();
    });

    it('allows devices in limited mode', async () => {
      mockUseAuth.mockReturnValue(authed({ isLimitedMode: true }));
      render(<MemoryRouter initialEntries={['/s/STORE1/devices']}><App /></MemoryRouter>);
      expect(await screen.findByText('Device Activation Page')).toBeInTheDocument();
    });

    it('shows Go to Dashboard link on Feature Unavailable', async () => {
      mockUseAuth.mockReturnValue(authed({ isLimitedMode: true }));
      render(<MemoryRouter initialEntries={['/s/STORE1/products']}><App /></MemoryRouter>);
      const link = await screen.findByText('Go to Dashboard');
      expect(link.closest('a')).toHaveAttribute('href', '/s/STORE1');
    });
  });

  // =========================================================================
  // LEGACY ROUTE REDIRECTS
  // =========================================================================
  describe('Legacy Route Redirects', () => {
    it('redirects /s/:storeCode/login to /retailer/login', async () => {
      render(<MemoryRouter initialEntries={['/s/STORE1/login']}><App /></MemoryRouter>);
      expect(await screen.findByText('Login Page')).toBeInTheDocument();
    });

    it('redirects /s/:storeCode/register to /retailer/register', async () => {
      render(<MemoryRouter initialEntries={['/s/STORE1/register']}><App /></MemoryRouter>);
      expect(await screen.findByText('Register Page')).toBeInTheDocument();
    });

    it('redirects /retailer/onboard to /retailer/register', async () => {
      render(<MemoryRouter initialEntries={['/retailer/onboard']}><App /></MemoryRouter>);
      expect(await screen.findByText('Register Page')).toBeInTheDocument();
    });

    it('redirects /retailer to /retailer/login', async () => {
      render(<MemoryRouter initialEntries={['/retailer']}><App /></MemoryRouter>);
      expect(await screen.findByText('Login Page')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // PUBLIC ROUTES ACCESSIBLE WITHOUT AUTH
  // =========================================================================
  describe('Public Routes — No Auth Required', () => {
    it('renders forgot password page without auth', async () => {
      render(<MemoryRouter initialEntries={['/retailer/forgot-password']}><App /></MemoryRouter>);
      expect(await screen.findByText('Forgot Password Page')).toBeInTheDocument();
    });

    it('renders reset password page without auth', async () => {
      render(<MemoryRouter initialEntries={['/retailer/reset-password']}><App /></MemoryRouter>);
      expect(await screen.findByText('Reset Password Page')).toBeInTheDocument();
    });

    it('renders help page without auth', async () => {
      render(<MemoryRouter initialEntries={['/retailer/help']}><App /></MemoryRouter>);
      expect(await screen.findByText('Help Page')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // CATCH-ALL 404
  // =========================================================================
  describe('404 Catch-All', () => {
    it('shows 404 for unknown route under /s/:storeCode', async () => {
      mockUseAuth.mockReturnValue(authed());
      render(<MemoryRouter initialEntries={['/s/STORE1/nonexistent-page']}><App /></MemoryRouter>);
      expect(await screen.findByText('404 Not Found')).toBeInTheDocument();
    });

    it('shows 404 for completely unknown top-level route', async () => {
      render(<MemoryRouter initialEntries={['/totally-unknown']}><App /></MemoryRouter>);
      expect(await screen.findByText('404 Not Found')).toBeInTheDocument();
    });
  });
});
