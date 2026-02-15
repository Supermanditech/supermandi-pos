import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import LoginPage from '../../../app/(auth)/login/page';

// Mock next/navigation
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/login',
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

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), {
    success: jest.fn(),
    error: jest.fn(),
  }),
}));

// Mock auth context
const mockRefreshProfile = jest.fn();
jest.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    refreshProfile: mockRefreshProfile,
    supplier: null,
    isAuthenticated: false,
    isLoading: false,
  }),
}));

// Mock API
jest.mock('../../../lib/api', () => ({
  phoneOtpLogin: jest.fn(),
  loginSupplier: jest.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
      this.name = 'ApiError';
    }
  },
  lookupSupplierRegistration: jest.fn(),
}));

// Mock firebase
jest.mock('../../../lib/firebase', () => ({
  setupRecaptcha: jest.fn(),
  sendOtp: jest.fn(),
  verifyOtp: jest.fn(),
  isFirebaseReady: jest.fn().mockReturnValue(false),
  cleanup: jest.fn(),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the sign in heading', () => {
    render(<LoginPage />);
    expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
  });

  it('renders phone input in OTP mode', () => {
    render(<LoginPage />);
    expect(screen.getByLabelText('Phone Number')).toBeInTheDocument();
  });

  it('renders Send OTP button', () => {
    render(<LoginPage />);
    expect(screen.getByText('Send OTP')).toBeInTheDocument();
  });

  it('shows toggle to password login', () => {
    render(<LoginPage />);
    const toggle = screen.getByText(/Sign in with email/);
    expect(toggle).toBeInTheDocument();
  });

  it('switches to password login mode', () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByText(/Sign in with email/));
    expect(screen.getByLabelText('Email Address')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByText('Sign In')).toBeInTheDocument();
  });

  it('switches back to OTP mode', () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByText(/Sign in with email/));
    fireEvent.click(screen.getByText(/Sign in with phone OTP/));
    expect(screen.getByLabelText('Phone Number')).toBeInTheDocument();
  });

  it('validates empty email in password mode', async () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByText(/Sign in with email/));
    fireEvent.click(screen.getByText('Sign In'));
    await waitFor(() => {
      expect(screen.getByText('Please enter your email address')).toBeInTheDocument();
    });
  });

  it('validates empty password in password mode', async () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByText(/Sign in with email/));
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'test@test.com' } });
    fireEvent.click(screen.getByText('Sign In'));
    await waitFor(() => {
      expect(screen.getByText('Please enter your password')).toBeInTheDocument();
    });
  });

  it('shows Register link', () => {
    render(<LoginPage />);
    const registerLinks = screen.getAllByText('Register');
    expect(registerLinks.length).toBeGreaterThan(0);
  });

  it('shows Forgot Password link', () => {
    render(<LoginPage />);
    expect(screen.getByText('Forgot Password?')).toBeInTheDocument();
  });

  it('shows firebase unavailable warning when firebase is not ready', async () => {
    render(<LoginPage />);
    // After mount, it should show the warning since isFirebaseReady returns false
    await waitFor(() => {
      expect(screen.getByText('Phone Verification Unavailable')).toBeInTheDocument();
    });
  });
});
