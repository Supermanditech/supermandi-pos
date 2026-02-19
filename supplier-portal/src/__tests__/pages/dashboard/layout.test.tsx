import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import DashboardLayout from '../../../app/(dashboard)/layout';

// Mock next/navigation
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock next/link
jest.mock('next/link', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ href, children, ...props }: any) =>
      React.createElement('a', { href, ...props }, children),
  };
});

// Mock auth context
const mockLogout = jest.fn();
const mockRefreshProfile = jest.fn();
jest.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    supplier: {
      businessName: 'Test Supplier',
      verificationStatus: 'verified',
      emailVerified: true,
    },
    isLoading: false,
    isAuthenticated: true,
    logout: mockLogout,
    refreshProfile: mockRefreshProfile,
  }),
}));

// Mock API
jest.mock('../../../lib/api', () => ({
  sendVerificationEmail: jest.fn(),
  verifyEmail: jest.fn(),
  getDashboardStats: jest.fn().mockResolvedValue({ newOrdersCount: 0 }),
  markOrdersRead: jest.fn().mockResolvedValue({}),
}));

// Mock BuildStamp
jest.mock('../../../components/BuildStamp', () => ({
  BuildStamp: () => <div data-testid="build-stamp">BuildStamp</div>,
}));

// Mock Modal
jest.mock('../../../components/Modal', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ isOpen, onClose, title, children, footer }: any) =>
      isOpen
        ? React.createElement('div', { 'data-testid': 'modal' }, [
            React.createElement('h2', { key: 'title' }, title),
            React.createElement('div', { key: 'children' }, children),
            React.createElement('div', { key: 'footer' }, footer),
          ])
        : null,
  };
});

// Mock LimitedModeBanner
jest.mock('../../../components/LimitedModeBanner', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ status }: any) =>
      status !== 'verified'
        ? React.createElement('div', { 'data-testid': 'limited-banner' }, `Limited: ${status}`)
        : null,
  };
});

// Mock lucide-react — must include ALL icons imported by layout.tsx
jest.mock('lucide-react', () => {
  const React = require('react');
  const mockIcon = (name: string) => (props: any) =>
    React.createElement('svg', { 'data-testid': `icon-${name}`, ...props });
  return {
    LayoutDashboard: mockIcon('LayoutDashboard'),
    Package: mockIcon('Package'),
    FileSpreadsheet: mockIcon('FileSpreadsheet'),
    ShoppingCart: mockIcon('ShoppingCart'),
    ClipboardList: mockIcon('ClipboardList'),
    DollarSign: mockIcon('DollarSign'),
    Receipt: mockIcon('Receipt'),
    User: mockIcon('User'),
    Menu: mockIcon('Menu'),
    X: mockIcon('X'),
    Bell: mockIcon('Bell'),
    MessageSquare: mockIcon('MessageSquare'),
    CreditCard: mockIcon('CreditCard'),
    HelpCircle: mockIcon('HelpCircle'),
  };
});

describe('DashboardLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders children content', () => {
    render(
      <DashboardLayout>
        <div data-testid="child">Dashboard Content</div>
      </DashboardLayout>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('renders navigation links', () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Products')).toBeInTheDocument();
    expect(screen.getByText('CSV Upload')).toBeInTheDocument();
    expect(screen.getByText('Orders')).toBeInTheDocument();
    expect(screen.getByText('KYC Documents')).toBeInTheDocument();
    expect(screen.getByText('Earnings')).toBeInTheDocument();
    expect(screen.getByText('Invoices')).toBeInTheDocument();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
  });

  it('renders supplier business name', () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );
    expect(screen.getByText('Test Supplier')).toBeInTheDocument();
  });

  it('renders SuperMandi brand text', () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );
    expect(screen.getByText('SuperMandi')).toBeInTheDocument();
  });

  it('renders Supplier Portal label', () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );
    expect(screen.getByText('Supplier Portal')).toBeInTheDocument();
  });

  it('renders logout button', () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );
    expect(screen.getByText('Logout')).toBeInTheDocument();
  });

  it('shows logout confirmation modal when clicking Logout', () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );
    fireEvent.click(screen.getByText('Logout'));
    expect(screen.getByText('Confirm Logout')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to logout/)).toBeInTheDocument();
  });

  it('renders mobile menu button', () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );
    expect(screen.getByLabelText('Open menu')).toBeInTheDocument();
  });

  it('renders skip to content link for accessibility', () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );
    expect(screen.getByText('Skip to content')).toBeInTheDocument();
  });

  it('renders BuildStamp in footer', () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );
    expect(screen.getByTestId('build-stamp')).toBeInTheDocument();
  });

  it('renders footer with copyright', () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );
    expect(screen.getByText(/2026 SuperMandi Tech/)).toBeInTheDocument();
  });

  it('renders main content area', () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );
    const main = document.getElementById('main-content');
    expect(main).toBeInTheDocument();
  });
});

describe('DashboardLayout - loading state', () => {
  it('shows loading spinner when auth is loading', () => {
    jest.spyOn(require('../../../lib/auth'), 'useAuth').mockReturnValue({
      supplier: null,
      isLoading: true,
      isAuthenticated: false,
      logout: jest.fn(),
      refreshProfile: jest.fn(),
    });
    const { container } = render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });
});

describe('DashboardLayout - unauthenticated', () => {
  it('redirects to login when not authenticated', () => {
    jest.spyOn(require('../../../lib/auth'), 'useAuth').mockReturnValue({
      supplier: null,
      isLoading: false,
      isAuthenticated: false,
      logout: jest.fn(),
      refreshProfile: jest.fn(),
    });
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );
    expect(mockPush).toHaveBeenCalledWith('/login');
  });
});
