import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import RegisterPageWrapper from '../../app/register/page';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/register',
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

// Mock firebase
jest.mock('../../lib/firebase', () => ({
  setupRecaptcha: jest.fn(),
  sendOtp: jest.fn(),
  verifyOtp: jest.fn(),
  isFirebaseReady: jest.fn().mockReturnValue(false),
  cleanup: jest.fn(),
}));

// Mock API
jest.mock('../../lib/api', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
  createSupplierApplication: jest.fn(),
  verifySupplierOtp: jest.fn(),
  submitSupplierKyc: jest.fn(),
  lookupSupplierRegistration: jest.fn(),
}));

// Mock sessionStorage
const sessionStorageMock = {
  getItem: jest.fn().mockReturnValue(null),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'sessionStorage', { value: sessionStorageMock });

describe('RegisterPageWrapper (Registration Page)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders registration heading', () => {
    render(<RegisterPageWrapper />);
    expect(screen.getByText('Register as Supplier')).toBeInTheDocument();
  });

  it('renders registration subtitle', () => {
    render(<RegisterPageWrapper />);
    expect(screen.getByText(/Complete the registration form to join SuperMandi/)).toBeInTheDocument();
  });

  it('renders step progress labels', () => {
    render(<RegisterPageWrapper />);
    expect(screen.getByText('Verify Phone')).toBeInTheDocument();
    expect(screen.getByText('Business Details')).toBeInTheDocument();
    expect(screen.getByText('KYC Documents')).toBeInTheDocument();
  });

  it('renders phone number input on first step', () => {
    render(<RegisterPageWrapper />);
    expect(screen.getByText('Verify your phone number')).toBeInTheDocument();
    expect(screen.getByLabelText(/Phone Number/)).toBeInTheDocument();
  });

  it('renders Send OTP button', () => {
    render(<RegisterPageWrapper />);
    expect(screen.getByText('Send OTP')).toBeInTheDocument();
  });

  it('renders Sign In link for existing users', () => {
    render(<RegisterPageWrapper />);
    const signInLink = screen.getByText('Sign In');
    expect(signInLink.closest('a')).toHaveAttribute('href', '/login');
  });

  it('shows firebase unavailable warning when firebase not ready', async () => {
    render(<RegisterPageWrapper />);
    await waitFor(() => {
      expect(screen.getByText('Phone Verification Unavailable')).toBeInTheDocument();
    });
  });

  it('disables Send OTP button when firebase not ready', () => {
    render(<RegisterPageWrapper />);
    const sendBtn = screen.getByText('Send OTP');
    expect(sendBtn.closest('button')).toBeDisabled();
  });

  it('validates empty phone number', async () => {
    const { isFirebaseReady } = require('../../lib/firebase');
    isFirebaseReady.mockReturnValue(true);
    render(<RegisterPageWrapper />);
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() => {
      expect(screen.getByText('Please enter a valid Indian mobile number (e.g. +919876543210 or 9876543210)')).toBeInTheDocument();
    });
  });
});
