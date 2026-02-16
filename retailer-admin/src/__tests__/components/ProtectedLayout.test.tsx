import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProtectedLayout from '../../components/ProtectedLayout';

// Mock AuthContext
const mockLogout = vi.fn();
const mockDismissSessionWarning = vi.fn();
let mockAuthState = {
  isAuthenticated: true,
  isLoading: false,
  user: { id: 'u1', phone: '+919876543210', role: 'admin' },
  store: { id: 's1', code: 'STORE1', name: 'My Store' },
  accessToken: 'test-token',
  login: vi.fn(),
  logout: mockLogout,
  showSessionWarning: false,
  dismissSessionWarning: mockDismissSessionWarning,
  isLimitedMode: false,
  applicationStatus: null as string | null,
};

vi.mock('../../lib/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

vi.mock('../../lib/api', () => ({
  API_GATEWAY_BASE: 'http://localhost:3000',
}));

// Mock child components that ProtectedLayout renders
vi.mock('../../components/DeviceRequiredBanner', () => ({
  default: () => <div data-testid="device-banner">Device Banner</div>,
}));

vi.mock('../../components/LimitedModeBanner', () => ({
  default: ({ status }: { status: string }) => <div data-testid="limited-banner">Limited: {status}</div>,
}));

vi.mock('../../components/BuildStamp', () => ({
  default: () => <span data-testid="build-stamp">v1.0.0</span>,
}));

vi.mock('../../components/Modal', () => ({
  default: ({ isOpen, title, children, actions }: any) => {
    if (!isOpen) return null;
    return (
      <div data-testid="modal" role="dialog">
        <div data-testid="modal-title">{title}</div>
        <div data-testid="modal-body">{children}</div>
        {actions && <div data-testid="modal-actions">{actions}</div>}
      </div>
    );
  },
}));

function renderLayout(path = '/s/STORE1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/s/:storeCode/*" element={<ProtectedLayout />}>
          <Route index element={<div data-testid="dashboard">Dashboard Content</div>} />
          <Route path="products" element={<div data-testid="products">Products Content</div>} />
          <Route path="settings" element={<div data-testid="settings">Settings Content</div>} />
        </Route>
        <Route path="/retailer/login" element={<div data-testid="login-page">Login Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthState = {
    isAuthenticated: true,
    isLoading: false,
    user: { id: 'u1', phone: '+919876543210', role: 'admin' },
    store: { id: 's1', code: 'STORE1', name: 'My Store' },
    accessToken: 'test-token',
    login: vi.fn(),
    logout: mockLogout,
    showSessionWarning: false,
    dismissSessionWarning: mockDismissSessionWarning,
    isLimitedMode: false,
    applicationStatus: null,
  };
});

// ── Rendering ────────────────────────────────────────────────────────────

describe('ProtectedLayout rendering', () => {
  it('renders sidebar with store name', () => {
    renderLayout();
    expect(screen.getByText('My Store')).toBeInTheDocument();
  });

  it('renders navigation links', () => {
    renderLayout();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Products')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders child route content', () => {
    renderLayout();
    expect(screen.getByTestId('dashboard')).toBeInTheDocument();
  });

  it('renders footer with copyright', () => {
    renderLayout();
    expect(screen.getByText(/2026 SuperMandi/)).toBeInTheDocument();
  });

  it('renders BuildStamp in footer', () => {
    renderLayout();
    expect(screen.getByTestId('build-stamp')).toBeInTheDocument();
  });

  it('renders SuperMandi brand name in sidebar', () => {
    renderLayout();
    // The brand name "SuperMandi" should appear
    const brandElements = screen.getAllByText('SuperMandi');
    expect(brandElements.length).toBeGreaterThan(0);
  });

  it('renders skip to content link', () => {
    renderLayout();
    const skipLink = document.querySelector('.skip-to-content');
    expect(skipLink).toBeTruthy();
    expect(skipLink?.getAttribute('href')).toBe('#main-content');
  });
});

// ── Logout ───────────────────────────────────────────────────────────────

describe('Logout flow', () => {
  it('shows logout confirmation modal when logout button clicked', () => {
    renderLayout();

    const logoutBtn = screen.getByText('Logout');
    fireEvent.click(logoutBtn);

    expect(screen.getByText('Confirm Logout')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to logout?')).toBeInTheDocument();
  });

  it('calls logout and navigates when confirmed', () => {
    renderLayout();

    fireEvent.click(screen.getByText('Logout'));

    // Find the Logout button in the confirmation modal
    const modalLogoutBtn = screen.getAllByText('Logout').find(
      el => el.classList.contains('modal-btn-danger')
    );

    if (modalLogoutBtn) {
      fireEvent.click(modalLogoutBtn);
    }

    expect(mockLogout).toHaveBeenCalled();
  });

  it('cancels logout when Cancel is clicked', () => {
    renderLayout();

    fireEvent.click(screen.getByText('Logout'));
    expect(screen.getByText('Confirm Logout')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Confirm Logout')).not.toBeInTheDocument();
    expect(mockLogout).not.toHaveBeenCalled();
  });
});

// ── Session Warning ──────────────────────────────────────────────────────

describe('Session warning', () => {
  it('shows session warning modal when showSessionWarning is true', () => {
    mockAuthState.showSessionWarning = true;
    renderLayout();

    expect(screen.getByText('Session Expiring Soon')).toBeInTheDocument();
    expect(screen.getByText(/session will expire/)).toBeInTheDocument();
  });

  it('does not show session warning when showSessionWarning is false', () => {
    mockAuthState.showSessionWarning = false;
    renderLayout();

    expect(screen.queryByText('Session Expiring Soon')).not.toBeInTheDocument();
  });

  it('calls dismissSessionWarning when Stay Logged In is clicked', () => {
    mockAuthState.showSessionWarning = true;
    renderLayout();

    const stayBtn = screen.getByText('Stay Logged In');
    fireEvent.click(stayBtn);

    expect(mockDismissSessionWarning).toHaveBeenCalled();
  });
});

// ── Admin Navigation ─────────────────────────────────────────────────────

describe('Admin navigation', () => {
  it('shows admin section for admin users', () => {
    mockAuthState.user = { id: 'u1', phone: '+91x', role: 'admin' };
    renderLayout();

    expect(screen.getByText('SuperAdmin')).toBeInTheDocument();
    expect(screen.getByText('Supplier Queue')).toBeInTheDocument();
    expect(screen.getByText('Product Queue')).toBeInTheDocument();
  });

  it('hides admin section for non-admin users', () => {
    mockAuthState.user = { id: 'u1', phone: '+91x', role: 'cashier' };
    renderLayout();

    expect(screen.queryByText('SuperAdmin')).not.toBeInTheDocument();
    expect(screen.queryByText('Supplier Queue')).not.toBeInTheDocument();
  });
});

// ── Limited Mode ─────────────────────────────────────────────────────────

describe('Limited mode', () => {
  it('shows limited mode banner when in limited mode', () => {
    mockAuthState.isLimitedMode = true;
    mockAuthState.applicationStatus = 'PENDING_APPROVAL';
    renderLayout();

    expect(screen.getByTestId('limited-banner')).toBeInTheDocument();
    expect(screen.getByText('Limited: PENDING_APPROVAL')).toBeInTheDocument();
  });

  it('does not show limited banner when not in limited mode', () => {
    mockAuthState.isLimitedMode = false;
    renderLayout();

    expect(screen.queryByTestId('limited-banner')).not.toBeInTheDocument();
  });

  it('filters navigation in limited mode', () => {
    mockAuthState.isLimitedMode = true;
    mockAuthState.applicationStatus = 'PENDING';
    renderLayout();

    // Dashboard and Settings should be visible
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();

    // Products, Suppliers etc should be hidden
    expect(screen.queryByText('Products')).not.toBeInTheDocument();
    expect(screen.queryByText('Suppliers')).not.toBeInTheDocument();
  });
});

// ── Active Navigation ────────────────────────────────────────────────────

describe('Active navigation highlighting', () => {
  it('highlights Dashboard link on root path', () => {
    renderLayout('/s/STORE1');

    const dashboardLink = screen.getByText('Dashboard').closest('a');
    expect(dashboardLink?.getAttribute('aria-current')).toBe('page');
  });

  it('highlights Products link on products path', () => {
    renderLayout('/s/STORE1/products');

    const productsLink = screen.getByText('Products').closest('a');
    expect(productsLink?.getAttribute('aria-current')).toBe('page');
  });
});
