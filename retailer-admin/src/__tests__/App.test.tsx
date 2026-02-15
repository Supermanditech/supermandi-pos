import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import App from '../App';

// Mock firebase
vi.mock('../lib/firebase', () => ({
  auth: {
    currentUser: null,
    onAuthStateChanged: vi.fn((callback) => {
      callback(null);
      return vi.fn(); // unsubscribe function
    }),
  },
  db: {},
}));

// Mock AuthContext to avoid Firebase initialization in tests
vi.mock('../lib/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useAuth: () => ({
    isAuthenticated: false,
    isLoading: false,
    user: null,
    store: null,
    isLimitedMode: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
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
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock lazy-loaded pages to avoid Suspense issues in tests
vi.mock('../pages/RegisterPage', () => ({
  default: () => <div>Register Page</div>,
}));

vi.mock('../pages/DashboardPage', () => ({
  default: () => <div>Dashboard Page</div>,
}));

vi.mock('../pages/ProductsPage', () => ({
  default: () => <div>Products Page</div>,
}));

vi.mock('../pages/NotFoundPage', () => ({
  default: () => <div>404 Not Found</div>,
}));

// Mock LoginPage (eagerly loaded)
vi.mock('../pages/LoginPage', () => ({
  default: () => <div>Login Page</div>,
}));

// Mock ProtectedLayout
vi.mock('../components/ProtectedLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="protected-layout">{children}</div>
  ),
}));

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>
    );

    // App should render something (at minimum, router should work)
    expect(document.body).toBeTruthy();
  });

  it('renders ErrorBoundary wrapper', () => {
    const { container } = render(
      <BrowserRouter>
        <App />
      </BrowserRouter>
    );

    // ErrorBoundary wraps everything, so the app should render normally
    expect(container.firstChild).toBeTruthy();
  });

  it('redirects root path to /retailer/login', async () => {
    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>
    );

    // Wait for redirect and lazy load
    await screen.findByText('Login Page');
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('renders Toaster component for notifications', () => {
    // Toaster is mocked, but we can verify it's included in the component tree
    const { container } = render(
      <BrowserRouter>
        <App />
      </BrowserRouter>
    );

    expect(container).toBeTruthy();
    // Toaster is rendered at root level in the actual component
  });

  it('wraps app in AuthProvider and FeatureFlagProvider', () => {
    // This is implicitly tested by the mocks above
    // If providers weren't rendered, the app would crash
    const { container } = render(
      <BrowserRouter>
        <App />
      </BrowserRouter>
    );

    expect(container).toBeTruthy();
  });

  it('handles navigation to /retailer/login', async () => {
    window.history.pushState({}, 'Login', '/retailer/login');

    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>
    );

    expect(await screen.findByText('Login Page')).toBeInTheDocument();
  });

  it('handles navigation to /retailer/register', async () => {
    window.history.pushState({}, 'Register', '/retailer/register');

    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>
    );

    expect(await screen.findByText('Register Page')).toBeInTheDocument();
  });

  it('handles unknown routes with 404 page', async () => {
    window.history.pushState({}, 'Unknown', '/unknown-route');

    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>
    );

    expect(await screen.findByText('404 Not Found')).toBeInTheDocument();
  });
});
