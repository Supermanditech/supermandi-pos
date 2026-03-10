import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import RegisterPageWrapper from '../../app/register/page';

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => '/register',
}));

jest.mock('next/link', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ href, children, ...props }: any) =>
      React.createElement('a', { href, ...props }, children),
  };
});

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), {
    success: jest.fn(),
    error: jest.fn(),
  }),
}));

const mockSetupRecaptcha = jest.fn();
const mockSendOtp = jest.fn();
const mockVerifyOtp = jest.fn();
const mockIsFirebaseReady = jest.fn().mockReturnValue(false);
const mockCleanup = jest.fn();

jest.mock('../../lib/firebase', () => ({
  setupRecaptcha: (...args: any[]) => mockSetupRecaptcha(...args),
  sendOtp: (...args: any[]) => mockSendOtp(...args),
  verifyOtp: (...args: any[]) => mockVerifyOtp(...args),
  isFirebaseReady: () => mockIsFirebaseReady(),
  cleanup: (...args: any[]) => mockCleanup(...args),
}));

const mockCreateSupplierApplication = jest.fn();
const mockVerifySupplierOtp = jest.fn();
const mockSubmitSupplierKyc = jest.fn();
const mockLookupSupplierRegistration = jest.fn();

jest.mock('../../lib/api', () => {
  class ApiError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message?: string) {
      super(message || code);
      this.status = status;
      this.code = code;
    }
  }
  return {
    ApiError,
    createSupplierApplication: (...args: any[]) => mockCreateSupplierApplication(...args),
    verifySupplierOtp: (...args: any[]) => mockVerifySupplierOtp(...args),
    submitSupplierKyc: (...args: any[]) => mockSubmitSupplierKyc(...args),
    lookupSupplierRegistration: (...args: any[]) => mockLookupSupplierRegistration(...args),
  };
});

jest.mock('../../hooks/useNavigationSafety', () => ({
  useUnsavedChanges: jest.fn(),
}));

const sessionStorageMock = {
  getItem: jest.fn().mockReturnValue(null),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'sessionStorage', { value: sessionStorageMock, writable: true });

if (!window.URL.createObjectURL) {
  window.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
}
if (!window.URL.revokeObjectURL) {
  window.URL.revokeObjectURL = jest.fn();
}

describe('RegisterPageWrapper (Registration Page)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockIsFirebaseReady.mockReturnValue(false);
    sessionStorageMock.getItem.mockReturnValue(null);
  });

  // ── Initial Render (Phone Step) ───────────────────────────────

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
    mockIsFirebaseReady.mockReturnValue(true);
    render(<RegisterPageWrapper />);
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() => {
      expect(screen.getByText('Please enter a valid Indian mobile number (e.g. +919876543210 or 9876543210)')).toBeInTheDocument();
    });
  });

  // ── Phone Validation ──────────────────────────────────────────

  it('validates short phone number', async () => {
    mockIsFirebaseReady.mockReturnValue(true);
    render(<RegisterPageWrapper />);
    fireEvent.change(screen.getByLabelText(/Phone Number/), { target: { value: '12345' } });
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() => {
      expect(screen.getByText(/valid Indian mobile number/)).toBeInTheDocument();
    });
  });

  it('validates phone starting with invalid digit', async () => {
    mockIsFirebaseReady.mockReturnValue(true);
    render(<RegisterPageWrapper />);
    fireEvent.change(screen.getByLabelText(/Phone Number/), { target: { value: '1234567890' } });
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() => {
      expect(screen.getByText(/valid Indian mobile number/)).toBeInTheDocument();
    });
  });

  it('accepts valid 10-digit phone and sends OTP', async () => {
    mockIsFirebaseReady.mockReturnValue(true);
    mockSendOtp.mockResolvedValue(undefined);
    render(<RegisterPageWrapper />);
    fireEvent.change(screen.getByLabelText(/Phone Number/), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() => {
      expect(mockSendOtp).toHaveBeenCalledWith('9876543210');
    });
  });

  it('accepts valid +91 phone and sends OTP', async () => {
    mockIsFirebaseReady.mockReturnValue(true);
    mockSendOtp.mockResolvedValue(undefined);
    render(<RegisterPageWrapper />);
    fireEvent.change(screen.getByLabelText(/Phone Number/), { target: { value: '+919876543210' } });
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() => {
      expect(mockSendOtp).toHaveBeenCalledWith('+919876543210');
    });
  });

  // ── OTP Step ──────────────────────────────────────────────────

  async function advanceToOtpStep() {
    mockIsFirebaseReady.mockReturnValue(true);
    mockSendOtp.mockResolvedValue(undefined);
    render(<RegisterPageWrapper />);
    fireEvent.change(screen.getByLabelText(/Phone Number/), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() => {
      expect(screen.getByText('Enter Verification Code')).toBeInTheDocument();
    });
  }

  it('shows OTP step after sending', async () => {
    await advanceToOtpStep();
    expect(screen.getByText(/Enter the 6-digit code sent to/)).toBeInTheDocument();
    expect(screen.getByText('Verify OTP')).toBeInTheDocument();
  });

  it('calls sendOtp on valid phone submit', async () => {
    mockIsFirebaseReady.mockReturnValue(true);
    mockSendOtp.mockResolvedValue(undefined);
    render(<RegisterPageWrapper />);
    fireEvent.change(screen.getByLabelText(/Phone Number/), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() => {
      expect(mockSendOtp).toHaveBeenCalled();
    });
  });

  it('handles OTP send failure', async () => {
    mockIsFirebaseReady.mockReturnValue(true);
    mockSendOtp.mockRejectedValue(new Error('Too many requests'));
    render(<RegisterPageWrapper />);
    fireEvent.change(screen.getByLabelText(/Phone Number/), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() => {
      expect(screen.getByText('Too many requests')).toBeInTheDocument();
    });
  });

  it('shows resend cooldown timer on OTP step', async () => {
    await advanceToOtpStep();
    expect(screen.getByText(/Resend in \d+s/)).toBeInTheDocument();
  });

  it('shows code expiry countdown', async () => {
    await advanceToOtpStep();
    expect(screen.getByText(/Code expires in/)).toBeInTheDocument();
  });

  it('disables Verify OTP button until 6 digits entered', async () => {
    await advanceToOtpStep();
    const verifyBtn = screen.getByRole('button', { name: 'Verify OTP' });
    expect(verifyBtn).toBeDisabled();
    const otpInput = screen.getByPlaceholderText('------');
    fireEvent.change(otpInput, { target: { value: '12345' } });
    expect(verifyBtn).toBeDisabled();
    fireEvent.change(otpInput, { target: { value: '123456' } });
    expect(verifyBtn).not.toBeDisabled();
  });

  it('strips non-digits from OTP input', async () => {
    await advanceToOtpStep();
    const otpInput = screen.getByPlaceholderText('------');
    fireEvent.change(otpInput, { target: { value: '12ab34cd56' } });
    expect(otpInput).toHaveValue('123456');
  });

  it('limits OTP to 6 characters', async () => {
    await advanceToOtpStep();
    const otpInput = screen.getByPlaceholderText('------');
    fireEvent.change(otpInput, { target: { value: '12345678' } });
    expect(otpInput).toHaveValue('123456');
  });

  it('shows Change Phone Number button on OTP step', async () => {
    await advanceToOtpStep();
    expect(screen.getByText('Change Phone Number')).toBeInTheDocument();
  });

  it('handles OTP verification failure', async () => {
    await advanceToOtpStep();
    mockVerifyOtp.mockRejectedValue(new Error('Invalid OTP'));
    const otpInput = screen.getByPlaceholderText('------');
    fireEvent.change(otpInput, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify OTP' }));
    await waitFor(() => {
      expect(screen.getByText('Invalid OTP')).toBeInTheDocument();
    });
  });

  // ── OTP → Details Transition ──────────────────────────────────

  async function advanceToDetailsStep() {
    mockIsFirebaseReady.mockReturnValue(true);
    mockSendOtp.mockResolvedValue(undefined);
    mockVerifyOtp.mockResolvedValue('firebase-id-token-123');
    render(<RegisterPageWrapper />);
    fireEvent.change(screen.getByLabelText(/Phone Number/), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() => {
      expect(screen.getByText('Enter Verification Code')).toBeInTheDocument();
    });
    const otpInput = screen.getByPlaceholderText('------');
    fireEvent.change(otpInput, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify OTP' }));
    await waitFor(() => {
      expect(screen.getByText('Business Identity')).toBeInTheDocument();
    });
  }

  it('advances to business details step after OTP verified', async () => {
    await advanceToDetailsStep();
    expect(screen.getByLabelText(/Business.*Company Name/)).toBeInTheDocument();
  });

  it('shows supplier type dropdown on details step', async () => {
    await advanceToDetailsStep();
    expect(screen.getByLabelText(/Supplier Type/)).toBeInTheDocument();
  });

  it('shows authorized person name field', async () => {
    await advanceToDetailsStep();
    expect(screen.getByLabelText(/Authorized Person Name/)).toBeInTheDocument();
  });

  it('shows address fields on details step', async () => {
    await advanceToDetailsStep();
    expect(screen.getByLabelText(/Address Line 1/)).toBeInTheDocument();
    expect(screen.getByLabelText(/City/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Pincode/)).toBeInTheDocument();
  });

  // ── Business Details Validation ───────────────────────────────

  it('shows Continue to Document Upload button on details step', async () => {
    await advanceToDetailsStep();
    expect(screen.getByText('Continue to Document Upload')).toBeInTheDocument();
  });

  it('disables details submit when agreement unchecked', async () => {
    await advanceToDetailsStep();
    const submitBtn = screen.getByRole('button', { name: 'Continue to Document Upload' });
    expect(submitBtn).toBeDisabled();
  });

  // ── Session Persistence (T-005) ───────────────────────────────

  it('persists phone to sessionStorage on change', async () => {
    mockIsFirebaseReady.mockReturnValue(true);
    render(<RegisterPageWrapper />);
    fireEvent.change(screen.getByLabelText(/Phone Number/), { target: { value: '9876543210' } });
    await waitFor(() => {
      expect(sessionStorageMock.setItem).toHaveBeenCalledWith(
        'supermandi_supplier_reg_state',
        expect.stringContaining('9876543210')
      );
    });
  });

  it('restores phone from sessionStorage on mount', () => {
    sessionStorageMock.getItem.mockReturnValue(JSON.stringify({
      step: 'phone',
      phone: '9999888877',
    }));
    mockIsFirebaseReady.mockReturnValue(true);
    render(<RegisterPageWrapper />);
    expect(screen.getByDisplayValue('9999888877')).toBeInTheDocument();
  });

  it('pre-fills phone from search params (login redirect)', () => {
    mockSearchParams = new URLSearchParams('phone=7777666655');
    mockIsFirebaseReady.mockReturnValue(true);
    render(<RegisterPageWrapper />);
    expect(screen.getByDisplayValue('7777666655')).toBeInTheDocument();
  });

  it('downgrades details step to phone on page refresh (security)', () => {
    sessionStorageMock.getItem.mockReturnValue(JSON.stringify({
      step: 'details',
      phone: '9876543210',
      businessName: 'Test Corp',
    }));
    mockIsFirebaseReady.mockReturnValue(true);
    render(<RegisterPageWrapper />);
    // Should be on phone step (downgraded from details because idToken not persisted)
    expect(screen.getByText(/Verify your phone number/)).toBeInTheDocument();
  });

  it('downgrades documents step to phone on page refresh', () => {
    sessionStorageMock.getItem.mockReturnValue(JSON.stringify({
      step: 'documents',
      phone: '9876543210',
    }));
    mockIsFirebaseReady.mockReturnValue(true);
    render(<RegisterPageWrapper />);
    expect(screen.getByText(/Verify your phone number/)).toBeInTheDocument();
  });

  it('downgrades OTP step to phone on page refresh', () => {
    sessionStorageMock.getItem.mockReturnValue(JSON.stringify({
      step: 'otp',
      phone: '9876543210',
    }));
    mockIsFirebaseReady.mockReturnValue(true);
    render(<RegisterPageWrapper />);
    expect(screen.getByText(/Verify your phone number/)).toBeInTheDocument();
  });

  // ── Suspense / Loading ────────────────────────────────────────

  it('renders without crashing via Suspense wrapper', () => {
    const { container } = render(<RegisterPageWrapper />);
    expect(container.querySelector('h1, h2')).toBeTruthy();
  });
});
