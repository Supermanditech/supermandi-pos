import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import LoginPage from '../../../app/(auth)/login/page';

// Mock next/navigation
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
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
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), {
    success: (...args: any[]) => mockToastSuccess(...args),
    error: (...args: any[]) => mockToastError(...args),
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

// Mock API — ApiError defined inside factory to avoid jest.mock hoisting issues
const mockPhoneOtpLogin = jest.fn();
const mockLoginSupplier = jest.fn();
const mockLookupSupplierRegistration = jest.fn();
const mockApiFetch = jest.fn();

jest.mock('../../../lib/api', () => {
  class ApiError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message?: string) {
      super(message || code);
      this.status = status;
      this.code = code;
      this.name = 'ApiError';
    }
  }
  return {
    ApiError,
    phoneOtpLogin: (...args: any[]) => mockPhoneOtpLogin(...args),
    loginSupplier: (...args: any[]) => mockLoginSupplier(...args),
    lookupSupplierRegistration: (...args: any[]) => mockLookupSupplierRegistration(...args),
    apiFetch: (...args: any[]) => mockApiFetch(...args),
  };
});

// Mock firebase
const mockSetupRecaptcha = jest.fn();
const mockSendOtp = jest.fn();
const mockVerifyOtp = jest.fn();
const mockIsFirebaseReady = jest.fn().mockReturnValue(false);
const mockCleanup = jest.fn();

jest.mock('../../../lib/firebase', () => ({
  setupRecaptcha: (...args: any[]) => mockSetupRecaptcha(...args),
  sendOtp: (...args: any[]) => mockSendOtp(...args),
  verifyOtp: (...args: any[]) => mockVerifyOtp(...args),
  isFirebaseReady: () => mockIsFirebaseReady(),
  cleanup: (...args: any[]) => mockCleanup(...args),
}));

// SessionStorage mock for FIX-064 cooldown persistence
const sessionStorageMock = {
  getItem: jest.fn().mockReturnValue(null),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'sessionStorage', { value: sessionStorageMock, writable: true });

describe('LoginPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsFirebaseReady.mockReturnValue(false);
    sessionStorageMock.getItem.mockReturnValue(null);
  });

  // ── Initial Render (OTP Mode) ────────────────────────────────

  it('renders the sign in heading', () => {
    render(<LoginPage />);
    expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
  });

  it('renders OTP mode subtitle', () => {
    render(<LoginPage />);
    expect(screen.getByText(/Enter your registered phone number to receive an OTP/)).toBeInTheDocument();
  });

  it('renders phone input in OTP mode', () => {
    render(<LoginPage />);
    expect(screen.getByLabelText('Phone Number')).toBeInTheDocument();
  });

  it('renders Send OTP button', () => {
    render(<LoginPage />);
    expect(screen.getByText('Send OTP')).toBeInTheDocument();
  });

  it('disables Send OTP when firebase not ready', () => {
    render(<LoginPage />);
    const btn = screen.getByText('Send OTP').closest('button');
    expect(btn).toBeDisabled();
  });

  it('shows firebase unavailable warning when firebase is not ready', async () => {
    render(<LoginPage />);
    await waitFor(() => {
      expect(screen.getByText('Phone Verification Unavailable')).toBeInTheDocument();
    });
  });

  it('hides firebase warning when firebase is ready', () => {
    mockIsFirebaseReady.mockReturnValue(true);
    render(<LoginPage />);
    expect(screen.queryByText('Phone Verification Unavailable')).not.toBeInTheDocument();
  });

  it('shows toggle to password login', () => {
    render(<LoginPage />);
    expect(screen.getByText('Sign in with email & password instead')).toBeInTheDocument();
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

  // ── Auth Mode Switching ──────────────────────────────────────

  it('switches to password login mode', () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByText('Sign in with email & password instead'));
    expect(screen.getByLabelText('Email Address')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByText('Sign In')).toBeInTheDocument();
  });

  it('shows password mode subtitle', () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByText('Sign in with email & password instead'));
    expect(screen.getByText('Sign in with your account and password')).toBeInTheDocument();
  });

  it('switches back to OTP mode', () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByText('Sign in with email & password instead'));
    fireEvent.click(screen.getByText('Sign in with OTP instead'));
    expect(screen.getByLabelText('Phone Number')).toBeInTheDocument();
  });

  it('clears error when switching auth modes', async () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByText('Sign in with email & password instead'));
    fireEvent.click(screen.getByText('Sign In'));
    await waitFor(() => {
      expect(screen.getByText('Please enter your email address')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Sign in with OTP instead'));
    expect(screen.queryByText('Please enter your email address')).not.toBeInTheDocument();
  });

  // ── Password Mode Validation ─────────────────────────────────

  it('validates empty email in password mode', async () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByText('Sign in with email & password instead'));
    fireEvent.click(screen.getByText('Sign In'));
    await waitFor(() => {
      expect(screen.getByText('Please enter your email address')).toBeInTheDocument();
    });
  });

  it('validates empty password in password mode', async () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByText('Sign in with email & password instead'));
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'test@test.com' } });
    fireEvent.click(screen.getByText('Sign In'));
    await waitFor(() => {
      expect(screen.getByText('Please enter your password')).toBeInTheDocument();
    });
  });

  it('shows inline email validation on blur', () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByText('Sign in with email & password instead'));
    const emailInput = screen.getByLabelText('Email Address');
    fireEvent.change(emailInput, { target: { value: 'bad-email' } });
    fireEvent.blur(emailInput);
    expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
  });

  it('toggles password visibility', () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByText('Sign in with email & password instead'));
    const pwInput = screen.getByLabelText('Password') as HTMLInputElement;
    expect(pwInput.type).toBe('password');
    fireEvent.click(screen.getByLabelText('Show password'));
    expect(pwInput.type).toBe('text');
    fireEvent.click(screen.getByLabelText('Hide password'));
    expect(pwInput.type).toBe('password');
  });

  it('shows Forgot Password link in password mode', () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByText('Sign in with email & password instead'));
    expect(screen.getByText('Forgot Password?')).toBeInTheDocument();
  });

  // ── Password Login Flow ──────────────────────────────────────

  it('calls loginSupplier with email and password', async () => {
    mockLoginSupplier.mockResolvedValue({ token: 'jwt' });
    mockRefreshProfile.mockResolvedValue(undefined);
    render(<LoginPage />);
    fireEvent.click(screen.getByText('Sign in with email & password instead'));
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'Test@Example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByText('Sign In'));
    await waitFor(() => {
      expect(mockLoginSupplier).toHaveBeenCalledWith({ email: 'test@example.com', password: 'secret123' });
    });
  });

  it('navigates to dashboard after password login', async () => {
    mockLoginSupplier.mockResolvedValue({ token: 'jwt' });
    mockRefreshProfile.mockResolvedValue(undefined);
    render(<LoginPage />);
    fireEvent.click(screen.getByText('Sign in with email & password instead'));
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'user@test.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pass' } });
    fireEvent.click(screen.getByText('Sign In'));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('shows toast on successful password login', async () => {
    mockLoginSupplier.mockResolvedValue({ token: 'jwt' });
    mockRefreshProfile.mockResolvedValue(undefined);
    render(<LoginPage />);
    fireEvent.click(screen.getByText('Sign in with email & password instead'));
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'u@t.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'p' } });
    fireEvent.click(screen.getByText('Sign In'));
    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith('Welcome back!');
    });
  });

  it('handles PASSWORD_NOT_SET error in password mode', async () => {
    const { ApiError } = jest.requireMock('../../../lib/api');
    mockLoginSupplier.mockRejectedValue(new ApiError(400, 'PASSWORD_NOT_SET'));
    render(<LoginPage />);
    fireEvent.click(screen.getByText('Sign in with email & password instead'));
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'u@t.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'p' } });
    fireEvent.click(screen.getByText('Sign In'));
    await waitFor(() => {
      expect(screen.getByText(/OTP login/)).toBeInTheDocument();
    });
  });

  it('handles ACCOUNT_LOCKED in password mode', async () => {
    const { ApiError } = jest.requireMock('../../../lib/api');
    mockLoginSupplier.mockRejectedValue(new ApiError(403, 'ACCOUNT_LOCKED'));
    render(<LoginPage />);
    fireEvent.click(screen.getByText('Sign in with email & password instead'));
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'u@t.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'p' } });
    fireEvent.click(screen.getByText('Sign In'));
    await waitFor(() => {
      expect(screen.getByText(/locked due to too many failed attempts/)).toBeInTheDocument();
    });
  });

  it('redirects to pending-approval on PENDING_APPROVAL in password mode', async () => {
    const { ApiError } = jest.requireMock('../../../lib/api');
    mockLoginSupplier.mockRejectedValue(new ApiError(403, 'PENDING_APPROVAL'));
    render(<LoginPage />);
    fireEvent.click(screen.getByText('Sign in with email & password instead'));
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'u@t.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'p' } });
    fireEvent.click(screen.getByText('Sign In'));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/pending-approval');
    });
  });

  // ── OTP Phone Validation ─────────────────────────────────────

  it('validates empty phone number', async () => {
    mockIsFirebaseReady.mockReturnValue(true);
    render(<LoginPage />);
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() => {
      expect(screen.getByText('Please enter a valid phone number')).toBeInTheDocument();
    });
  });

  it('validates short phone number', async () => {
    mockIsFirebaseReady.mockReturnValue(true);
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: '123' } });
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() => {
      expect(screen.getByText('Please enter a valid phone number')).toBeInTheDocument();
    });
  });

  // ── Lookup-First OTP Flow ────────────────────────────────────

  it('shows not_onboarded state when phone not registered', async () => {
    mockIsFirebaseReady.mockReturnValue(true);
    mockLookupSupplierRegistration.mockResolvedValue({ exists: false });
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() => {
      expect(screen.getByText('Account not found')).toBeInTheDocument();
    });
  });

  it('shows register link in not_onboarded state', async () => {
    mockIsFirebaseReady.mockReturnValue(true);
    mockLookupSupplierRegistration.mockResolvedValue({ exists: false });
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() => {
      expect(screen.getByText('Account not found')).toBeInTheDocument();
    });
    // Register link in the not_onboarded UI
    const registerLink = screen.getAllByText('Register').find(el => el.closest('a')?.getAttribute('href') === '/register');
    expect(registerLink).toBeTruthy();
  });

  it('shows "Use a different phone number" in not_onboarded state', async () => {
    mockIsFirebaseReady.mockReturnValue(true);
    mockLookupSupplierRegistration.mockResolvedValue({ exists: false });
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() => {
      expect(screen.getByText('Use a different phone number')).toBeInTheDocument();
    });
  });

  it('shows pending review error when PENDING_APPROVAL', async () => {
    mockIsFirebaseReady.mockReturnValue(true);
    mockLookupSupplierRegistration.mockResolvedValue({ exists: true, nextStep: 'PENDING_APPROVAL' });
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() => {
      expect(screen.getByText(/under review/)).toBeInTheDocument();
    });
  });

  it('shows incomplete registration state when UPLOAD_DOCUMENTS', async () => {
    mockIsFirebaseReady.mockReturnValue(true);
    mockLookupSupplierRegistration.mockResolvedValue({ exists: true, nextStep: 'UPLOAD_DOCUMENTS' });
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() => {
      expect(screen.getByText('Resume Registration')).toBeInTheDocument();
    });
  });

  it('resume link includes phone and resume params', async () => {
    mockIsFirebaseReady.mockReturnValue(true);
    mockLookupSupplierRegistration.mockResolvedValue({ exists: true, nextStep: 'VERIFY_PHONE' });
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() => {
      expect(screen.getByText('Resume Registration')).toBeInTheDocument();
    });
    const resumeLink = screen.getByText('Resume Registration').closest('a');
    expect(resumeLink?.getAttribute('href')).toContain('phone=9876543210');
    expect(resumeLink?.getAttribute('href')).toContain('resume=true');
  });

  it('shows suspended error when ACCOUNT_SUSPENDED', async () => {
    mockIsFirebaseReady.mockReturnValue(true);
    mockLookupSupplierRegistration.mockResolvedValue({ exists: true, nextStep: 'ACCOUNT_SUSPENDED' });
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() => {
      expect(screen.getByText(/suspended.*contact support/i)).toBeInTheDocument();
    });
  });

  it('shows contact support error when CONTACT_SUPPORT', async () => {
    mockIsFirebaseReady.mockReturnValue(true);
    mockLookupSupplierRegistration.mockResolvedValue({ exists: true, nextStep: 'CONTACT_SUPPORT' });
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() => {
      expect(screen.getByText(/not approved.*contact support/i)).toBeInTheDocument();
    });
  });

  it('shows generic error for unknown nextStep', async () => {
    mockIsFirebaseReady.mockReturnValue(true);
    mockLookupSupplierRegistration.mockResolvedValue({ exists: true, nextStep: 'UNKNOWN_STATUS' });
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() => {
      expect(screen.getByText(/unable to proceed|contact support/i)).toBeInTheDocument();
    });
  });

  it('sends OTP when LOGIN_ALLOWED', async () => {
    mockIsFirebaseReady.mockReturnValue(true);
    mockLookupSupplierRegistration.mockResolvedValue({ exists: true, nextStep: 'LOGIN_ALLOWED' });
    mockSendOtp.mockResolvedValue(undefined);
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() => {
      expect(mockSendOtp).toHaveBeenCalledWith('9876543210');
    });
  });

  it('handles OTP send failure', async () => {
    mockIsFirebaseReady.mockReturnValue(true);
    mockLookupSupplierRegistration.mockResolvedValue({ exists: true, nextStep: 'LOGIN_ALLOWED' });
    mockSendOtp.mockRejectedValue(new Error('Too many requests'));
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() => {
      expect(screen.getByText('Too many requests')).toBeInTheDocument();
    });
  });

  it('handles lookup API error', async () => {
    const { ApiError } = jest.requireMock('../../../lib/api');
    mockIsFirebaseReady.mockReturnValue(true);
    mockLookupSupplierRegistration.mockRejectedValue(new ApiError(500, 'SERVER_ERROR', 'Internal server error'));
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() => {
      expect(screen.getByText('Internal server error')).toBeInTheDocument();
    });
  });

  // ── OTP Step ─────────────────────────────────────────────────

  async function advanceToOtpStep() {
    mockIsFirebaseReady.mockReturnValue(true);
    mockLookupSupplierRegistration.mockResolvedValue({ exists: true, nextStep: 'LOGIN_ALLOWED' });
    mockSendOtp.mockResolvedValue(undefined);
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() => {
      expect(screen.getByLabelText('Verification Code')).toBeInTheDocument();
    });
  }

  it('advances to OTP step after successful send', async () => {
    await advanceToOtpStep();
    expect(screen.getByText(/Enter the 6-digit code sent to/)).toBeInTheDocument();
    expect(screen.getByText('Verify & Sign In')).toBeInTheDocument();
  });

  it('shows OTP input with placeholder', async () => {
    await advanceToOtpStep();
    expect(screen.getByPlaceholderText('Enter 6-digit PIN')).toBeInTheDocument();
  });

  it('disables verify button until 6 digits entered', async () => {
    await advanceToOtpStep();
    const verifyBtn = screen.getByText('Verify & Sign In').closest('button');
    expect(verifyBtn).toBeDisabled();
    const otpInput = screen.getByLabelText('Verification Code');
    fireEvent.change(otpInput, { target: { value: '12345' } });
    expect(verifyBtn).toBeDisabled();
    fireEvent.change(otpInput, { target: { value: '123456' } });
    expect(verifyBtn).not.toBeDisabled();
  });

  it('strips non-digits from OTP input', async () => {
    await advanceToOtpStep();
    const otpInput = screen.getByLabelText('Verification Code') as HTMLInputElement;
    fireEvent.change(otpInput, { target: { value: '12ab34cd56' } });
    expect(otpInput.value).toBe('123456');
  });

  it('limits OTP to 6 characters', async () => {
    await advanceToOtpStep();
    const otpInput = screen.getByLabelText('Verification Code') as HTMLInputElement;
    fireEvent.change(otpInput, { target: { value: '12345678' } });
    expect(otpInput.value).toBe('123456');
  });

  it('shows resend cooldown after OTP sent', async () => {
    await advanceToOtpStep();
    expect(screen.getByText(/Resend in \d+s/)).toBeInTheDocument();
  });

  it('shows code expiry countdown', async () => {
    await advanceToOtpStep();
    expect(screen.getByText(/Code expires in/)).toBeInTheDocument();
  });

  it('shows Change Phone Number button on OTP step', async () => {
    await advanceToOtpStep();
    expect(screen.getByText('Change Phone Number')).toBeInTheDocument();
  });

  // ── OTP Verification ────────────────────────────────────────

  it('navigates to dashboard after successful OTP verify', async () => {
    await advanceToOtpStep();
    mockVerifyOtp.mockResolvedValue('firebase-id-token');
    mockPhoneOtpLogin.mockResolvedValue({ status: 'active' });
    mockRefreshProfile.mockResolvedValue(undefined);
    const otpInput = screen.getByLabelText('Verification Code');
    fireEvent.change(otpInput, { target: { value: '123456' } });
    fireEvent.click(screen.getByText('Verify & Sign In'));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('shows welcome toast on successful verify', async () => {
    await advanceToOtpStep();
    mockVerifyOtp.mockResolvedValue('firebase-id-token');
    mockPhoneOtpLogin.mockResolvedValue({ status: 'active' });
    mockRefreshProfile.mockResolvedValue(undefined);
    fireEvent.change(screen.getByLabelText('Verification Code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByText('Verify & Sign In'));
    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith('Welcome back!');
    });
  });

  it('redirects to pending-approval when status is pending', async () => {
    await advanceToOtpStep();
    mockVerifyOtp.mockResolvedValue('firebase-id-token');
    mockPhoneOtpLogin.mockResolvedValue({ status: 'pending' });
    fireEvent.change(screen.getByLabelText('Verification Code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByText('Verify & Sign In'));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/pending-approval');
    });
  });

  it('shows error when status is inactive', async () => {
    await advanceToOtpStep();
    mockVerifyOtp.mockResolvedValue('firebase-id-token');
    mockPhoneOtpLogin.mockResolvedValue({ status: 'inactive' });
    fireEvent.change(screen.getByLabelText('Verification Code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByText('Verify & Sign In'));
    await waitFor(() => {
      expect(screen.getByText(/not active.*contact support/i)).toBeInTheDocument();
    });
  });

  it('handles PENDING_APPROVAL ApiError code during verify', async () => {
    await advanceToOtpStep();
    const { ApiError } = jest.requireMock('../../../lib/api');
    mockVerifyOtp.mockResolvedValue('firebase-id-token');
    mockPhoneOtpLogin.mockRejectedValue(new ApiError(403, 'PENDING_APPROVAL'));
    fireEvent.change(screen.getByLabelText('Verification Code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByText('Verify & Sign In'));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/pending-approval');
    });
  });

  it('handles ACCOUNT_SUSPENDED ApiError code during verify', async () => {
    await advanceToOtpStep();
    const { ApiError } = jest.requireMock('../../../lib/api');
    mockVerifyOtp.mockResolvedValue('firebase-id-token');
    mockPhoneOtpLogin.mockRejectedValue(new ApiError(403, 'ACCOUNT_SUSPENDED'));
    fireEvent.change(screen.getByLabelText('Verification Code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByText('Verify & Sign In'));
    await waitFor(() => {
      expect(screen.getByText(/suspended.*contact support/i)).toBeInTheDocument();
    });
  });

  it('handles USER_NOT_FOUND ApiError code during verify', async () => {
    await advanceToOtpStep();
    const { ApiError } = jest.requireMock('../../../lib/api');
    mockVerifyOtp.mockResolvedValue('firebase-id-token');
    mockPhoneOtpLogin.mockRejectedValue(new ApiError(404, 'USER_NOT_FOUND'));
    fireEvent.change(screen.getByLabelText('Verification Code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByText('Verify & Sign In'));
    await waitFor(() => {
      expect(screen.getByText(/No account found.*register first/i)).toBeInTheDocument();
    });
  });

  it('handles server error (500) during verify', async () => {
    await advanceToOtpStep();
    const { ApiError } = jest.requireMock('../../../lib/api');
    mockVerifyOtp.mockResolvedValue('firebase-id-token');
    mockPhoneOtpLogin.mockRejectedValue(new ApiError(500, 'INTERNAL'));
    fireEvent.change(screen.getByLabelText('Verification Code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByText('Verify & Sign In'));
    await waitFor(() => {
      expect(screen.getByText(/Server error.*try again later/i)).toBeInTheDocument();
    });
  });

  it('handles non-ApiError during verify', async () => {
    await advanceToOtpStep();
    mockVerifyOtp.mockRejectedValue(new Error('Network failed'));
    fireEvent.change(screen.getByLabelText('Verification Code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByText('Verify & Sign In'));
    await waitFor(() => {
      expect(screen.getByText('Network failed')).toBeInTheDocument();
    });
  });

  // ── FIX-064: Session Cooldown Persistence ────────────────────

  it('persists cooldown to sessionStorage on OTP send', async () => {
    await advanceToOtpStep();
    expect(sessionStorageMock.setItem).toHaveBeenCalledWith(
      'supplier_otp_cooldown_until',
      expect.any(String)
    );
  });

  // ── Edge Cases ───────────────────────────────────────────────

  it('normalizes 10-digit phone to +91 for lookup', async () => {
    mockIsFirebaseReady.mockReturnValue(true);
    mockLookupSupplierRegistration.mockResolvedValue({ exists: true, nextStep: 'LOGIN_ALLOWED' });
    mockSendOtp.mockResolvedValue(undefined);
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() => {
      expect(mockLookupSupplierRegistration).toHaveBeenCalledWith('+919876543210');
    });
  });

  it('passes +91 phone directly to lookup', async () => {
    mockIsFirebaseReady.mockReturnValue(true);
    mockLookupSupplierRegistration.mockResolvedValue({ exists: true, nextStep: 'LOGIN_ALLOWED' });
    mockSendOtp.mockResolvedValue(undefined);
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: '+919876543210' } });
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() => {
      expect(mockLookupSupplierRegistration).toHaveBeenCalledWith('+919876543210');
    });
  });
});
