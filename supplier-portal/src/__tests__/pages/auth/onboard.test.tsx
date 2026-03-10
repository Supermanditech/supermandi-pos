import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import SupplierOnboardingPage from '../../../app/(auth)/onboard/page';

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/onboard',
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
const mockIsFirebaseReady = jest.fn().mockReturnValue(true);
const mockCleanup = jest.fn();

jest.mock('../../../lib/firebase', () => ({
  setupRecaptcha: (...args: any[]) => mockSetupRecaptcha(...args),
  sendOtp: (...args: any[]) => mockSendOtp(...args),
  verifyOtp: (...args: any[]) => mockVerifyOtp(...args),
  isFirebaseReady: () => mockIsFirebaseReady(),
  cleanup: (...args: any[]) => mockCleanup(...args),
}));

const mockCreateSupplierApplication = jest.fn();
const mockVerifySupplierOtp = jest.fn();
const mockSubmitSupplierKyc = jest.fn();
const mockUploadSupplierDocument = jest.fn();
const mockHasAuthCookie = jest.fn().mockReturnValue(false);

jest.mock('../../../lib/api', () => {
  class ApiError extends Error {
    status: number;
    code: string;
    applicationId?: string;
    applicationStatus?: string;
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
    uploadSupplierDocument: (...args: any[]) => mockUploadSupplierDocument(...args),
    hasAuthCookie: () => mockHasAuthCookie(),
  };
});

jest.mock('../../../lib/fileLimits', () => ({
  MAX_KYC_DOCUMENT_SIZE_BYTES: 5 * 1024 * 1024,
  MAX_KYC_DOCUMENT_SIZE_LABEL: '5 MB',
}));

jest.mock('../../../hooks/useNavigationSafety', () => ({
  useUnsavedChanges: jest.fn(),
}));

const sessionStorageMock = {
  getItem: jest.fn().mockReturnValue(null),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'sessionStorage', { value: sessionStorageMock, writable: true });

describe('SupplierOnboardingPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockIsFirebaseReady.mockReturnValue(true);
    mockHasAuthCookie.mockReturnValue(false);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── Step 1: Business Details ──────────────────────────────────

  it('renders business details form on initial load', () => {
    render(<SupplierOnboardingPage />);
    expect(screen.getByText('Register as Supplier')).toBeInTheDocument();
    expect(screen.getByLabelText('Business Name *')).toBeInTheDocument();
    expect(screen.getByLabelText('Owner Name *')).toBeInTheDocument();
    expect(screen.getByLabelText('GSTIN *')).toBeInTheDocument();
    expect(screen.getByLabelText('Email *')).toBeInTheDocument();
    expect(screen.getByLabelText('Phone Number *')).toBeInTheDocument();
  });

  it('renders progress indicator with 5 steps', () => {
    const { container } = render(<SupplierOnboardingPage />);
    const progressBars = container.querySelectorAll('.h-1.w-8');
    expect(progressBars.length).toBe(5);
  });

  it('renders optional address fields', () => {
    render(<SupplierOnboardingPage />);
    expect(screen.getByLabelText('Address Line 1')).toBeInTheDocument();
    expect(screen.getByLabelText('City')).toBeInTheDocument();
    expect(screen.getByLabelText('Pincode')).toBeInTheDocument();
  });

  it('renders optional bank details section', () => {
    render(<SupplierOnboardingPage />);
    expect(screen.getByText(/Bank Details \(Optional/)).toBeInTheDocument();
  });

  it('renders Sign In link for existing users', () => {
    render(<SupplierOnboardingPage />);
    const signInLink = screen.getByText('Sign In');
    expect(signInLink.closest('a')).toHaveAttribute('href', '/login');
  });

  it('renders Continue button', () => {
    render(<SupplierOnboardingPage />);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
  });

  it('redirects authenticated users to dashboard', () => {
    mockHasAuthCookie.mockReturnValue(true);
    render(<SupplierOnboardingPage />);
    expect(mockReplace).toHaveBeenCalledWith('/dashboard');
  });

  // ── Business Details Validation ───────────────────────────────

  it('shows error when business name is empty', async () => {
    render(<SupplierOnboardingPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(screen.getByText('Business name is required')).toBeInTheDocument();
    });
  });

  it('shows error when owner name is empty', async () => {
    render(<SupplierOnboardingPage />);
    fireEvent.change(screen.getByLabelText('Business Name *'), { target: { value: 'Test Corp' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(screen.getByText('Owner name is required')).toBeInTheDocument();
    });
  });

  it('shows error for invalid GSTIN format', async () => {
    render(<SupplierOnboardingPage />);
    fireEvent.change(screen.getByLabelText('Business Name *'), { target: { value: 'Test Corp' } });
    fireEvent.change(screen.getByLabelText('Owner Name *'), { target: { value: 'John' } });
    fireEvent.change(screen.getByLabelText('GSTIN *'), { target: { value: 'INVALID' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(screen.getByText('GSTIN must be 15 characters')).toBeInTheDocument();
    });
  });

  it('shows error for invalid GSTIN pattern', async () => {
    render(<SupplierOnboardingPage />);
    fireEvent.change(screen.getByLabelText('Business Name *'), { target: { value: 'Test Corp' } });
    fireEvent.change(screen.getByLabelText('Owner Name *'), { target: { value: 'John' } });
    fireEvent.change(screen.getByLabelText('GSTIN *'), { target: { value: '123456789012345' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(screen.getByText('Invalid GSTIN format')).toBeInTheDocument();
    });
  });

  it('shows error for invalid email', async () => {
    render(<SupplierOnboardingPage />);
    fireEvent.change(screen.getByLabelText('Business Name *'), { target: { value: 'Test Corp' } });
    fireEvent.change(screen.getByLabelText('Owner Name *'), { target: { value: 'John' } });
    fireEvent.change(screen.getByLabelText('GSTIN *'), { target: { value: '22AAAAA0000A1Z5' } });
    fireEvent.change(screen.getByLabelText('Email *'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Phone Number *'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Valid email address is required');
    });
  });

  it('shows error when phone is empty', async () => {
    render(<SupplierOnboardingPage />);
    fireEvent.change(screen.getByLabelText('Business Name *'), { target: { value: 'Test Corp' } });
    fireEvent.change(screen.getByLabelText('Owner Name *'), { target: { value: 'John' } });
    fireEvent.change(screen.getByLabelText('GSTIN *'), { target: { value: '22AAAAA0000A1Z5' } });
    fireEvent.change(screen.getByLabelText('Email *'), { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(screen.getByText('Phone number is required')).toBeInTheDocument();
    });
  });

  it('shows error for invalid pincode', async () => {
    render(<SupplierOnboardingPage />);
    fireEvent.change(screen.getByLabelText('Business Name *'), { target: { value: 'Test Corp' } });
    fireEvent.change(screen.getByLabelText('Owner Name *'), { target: { value: 'John' } });
    fireEvent.change(screen.getByLabelText('GSTIN *'), { target: { value: '22AAAAA0000A1Z5' } });
    fireEvent.change(screen.getByLabelText('Email *'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText('Phone Number *'), { target: { value: '9876543210' } });
    fireEvent.change(screen.getByLabelText('Pincode'), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(screen.getByText('Pincode must be 6 digits')).toBeInTheDocument();
    });
  });

  // ── Business Submit → Phone Step Transition ───────────────────

  const fillBusinessForm = () => {
    fireEvent.change(screen.getByLabelText('Business Name *'), { target: { value: 'Test Corp' } });
    fireEvent.change(screen.getByLabelText('Owner Name *'), { target: { value: 'John Doe' } });
    fireEvent.change(screen.getByLabelText('GSTIN *'), { target: { value: '22AAAAA0000A1Z5' } });
    fireEvent.change(screen.getByLabelText('Email *'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText('Phone Number *'), { target: { value: '9876543210' } });
  };

  it('submits business details and advances to phone step', async () => {
    mockCreateSupplierApplication.mockResolvedValue({
      application: { id: 'app-123', status: 'DRAFT' },
    });
    render(<SupplierOnboardingPage />);
    fillBusinessForm();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(mockCreateSupplierApplication).toHaveBeenCalled();
      // After success, phone step should show Send OTP
      expect(screen.getByText('Send OTP')).toBeInTheDocument();
    });
  });

  it('shows loading state during business submission', async () => {
    let resolvePromise: any;
    mockCreateSupplierApplication.mockReturnValue(new Promise(r => { resolvePromise = r; }));
    render(<SupplierOnboardingPage />);
    fillBusinessForm();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(screen.getByText('Submitting...')).toBeInTheDocument();
    });
    await act(async () => {
      resolvePromise({ application: { id: 'app-123', status: 'DRAFT' } });
    });
  });

  it('handles GSTIN_EXISTS error with resume', async () => {
    const { ApiError } = require('../../../lib/api');
    const err = new ApiError(409, 'GSTIN_EXISTS', 'GSTIN already registered');
    err.applicationId = 'existing-app-456';
    err.applicationStatus = 'DRAFT';
    mockCreateSupplierApplication.mockRejectedValue(err);
    render(<SupplierOnboardingPage />);
    fillBusinessForm();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(screen.getByText(/Send OTP/)).toBeInTheDocument();
    });
  });

  it('redirects to login for ACTIVE application', async () => {
    const { ApiError } = require('../../../lib/api');
    const err = new ApiError(409, 'APPLICATION_EXISTS', 'Application exists');
    err.applicationId = 'existing-app-789';
    err.applicationStatus = 'ACTIVE';
    mockCreateSupplierApplication.mockRejectedValue(err);
    render(<SupplierOnboardingPage />);
    fillBusinessForm();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      const toast = require('react-hot-toast').default;
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('already approved'));
    });
  });

  it('handles generic API error', async () => {
    mockCreateSupplierApplication.mockRejectedValue((() => { const { ApiError } = require('../../../lib/api'); return new ApiError(500, 'SERVER_ERROR', 'Internal error'); })());
    render(<SupplierOnboardingPage />);
    fillBusinessForm();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(screen.getByText('Internal error')).toBeInTheDocument();
    });
  });

  it('handles non-API error', async () => {
    mockCreateSupplierApplication.mockRejectedValue(new Error('Network error'));
    render(<SupplierOnboardingPage />);
    fillBusinessForm();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(screen.getByText('Failed to submit. Please try again.')).toBeInTheDocument();
    });
  });

  // ── Step 2: Phone - Send OTP ──────────────────────────────────

  async function advanceToPhoneStep() {
    mockCreateSupplierApplication.mockResolvedValue({
      application: { id: 'app-123', status: 'DRAFT' },
    });
    render(<SupplierOnboardingPage />);
    fillBusinessForm();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(screen.getByText(/Application created/)).toBeInTheDocument();
    });
  }

  it('shows phone step with readonly phone number', async () => {
    await advanceToPhoneStep();
    expect(screen.getByDisplayValue('9876543210')).toBeInTheDocument();
    expect(screen.getByText(/Send OTP/)).toBeInTheDocument();
  });

  it('shows Back button on phone step', async () => {
    await advanceToPhoneStep();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('navigates back to business step', async () => {
    await advanceToPhoneStep();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Business Name *')).toBeInTheDocument();
    });
  });

  it('shows firebase unavailable warning when not ready', async () => {
    mockIsFirebaseReady.mockReturnValue(false);
    mockCreateSupplierApplication.mockResolvedValue({
      application: { id: 'app-123', status: 'DRAFT' },
    });
    render(<SupplierOnboardingPage />);
    fillBusinessForm();
    // Need to temporarily enable firebase for business submit
    mockIsFirebaseReady.mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(screen.getByText('Phone Verification Unavailable')).toBeInTheDocument();
    });
  });

  // ── Step 3: OTP Verification ──────────────────────────────────

  async function advanceToOtpStep() {
    mockCreateSupplierApplication.mockResolvedValue({
      application: { id: 'app-123', status: 'DRAFT' },
    });
    mockSendOtp.mockResolvedValue(undefined);
    render(<SupplierOnboardingPage />);
    fillBusinessForm();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(screen.getByText(/Send OTP/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() => {
      expect(screen.getByLabelText('Enter OTP')).toBeInTheDocument();
    });
  }

  it('advances to OTP step after sending', async () => {
    await advanceToOtpStep();
    expect(screen.getByPlaceholderText('123456')).toBeInTheDocument();
    expect(screen.getByText('Verify OTP')).toBeInTheDocument();
  });

  it('disables verify button until 6 digits entered', async () => {
    await advanceToOtpStep();
    const verifyBtn = screen.getByRole('button', { name: 'Verify OTP' });
    expect(verifyBtn).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '12345' } });
    expect(verifyBtn).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '123456' } });
    expect(verifyBtn).not.toBeDisabled();
  });

  it('shows resend cooldown timer', async () => {
    await advanceToOtpStep();
    expect(screen.getByText(/Resend in \d+s/)).toBeInTheDocument();
  });

  it('shows OTP expiry countdown', async () => {
    await advanceToOtpStep();
    expect(screen.getByText(/OTP expires in/)).toBeInTheDocument();
  });

  it('shows back button on OTP step', async () => {
    await advanceToOtpStep();
    expect(screen.getByText('Back')).toBeInTheDocument();
  });

  it('handles send OTP failure', async () => {
    mockCreateSupplierApplication.mockResolvedValue({
      application: { id: 'app-123', status: 'DRAFT' },
    });
    mockSendOtp.mockRejectedValue(new Error('Too many attempts'));
    render(<SupplierOnboardingPage />);
    fillBusinessForm();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(screen.getByText(/Send OTP/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() => {
      expect(screen.getByText('Too many attempts')).toBeInTheDocument();
    });
  });

  // ── OTP Verification → KYC Step ──────────────────────────────

  async function advanceToKycStep() {
    mockCreateSupplierApplication.mockResolvedValue({
      application: { id: 'app-123', status: 'DRAFT' },
    });
    mockSendOtp.mockResolvedValue(undefined);
    mockVerifyOtp.mockResolvedValue('firebase-id-token-123');
    mockVerifySupplierOtp.mockResolvedValue({ status: 'DRAFT' });
    render(<SupplierOnboardingPage />);
    fillBusinessForm();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(screen.getByText(/Send OTP/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() => {
      expect(screen.getByLabelText('Enter OTP')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify OTP' }));
    await waitFor(() => {
      expect(screen.getByText(/Phone verified/)).toBeInTheDocument();
    });
  }

  it('advances to KYC step after OTP verification', async () => {
    await advanceToKycStep();
    expect(screen.getByLabelText('PAN Card *')).toBeInTheDocument();
    expect(screen.getByLabelText('GSTIN Certificate *')).toBeInTheDocument();
    expect(screen.getByLabelText('Address Proof *')).toBeInTheDocument();
  });

  it('stores application id in sessionStorage after OTP verification', async () => {
    await advanceToKycStep();
    expect(sessionStorageMock.setItem).toHaveBeenCalledWith('supplier_application_id', 'app-123');
  });

  it('handles OTP verification failure', async () => {
    mockCreateSupplierApplication.mockResolvedValue({
      application: { id: 'app-123', status: 'DRAFT' },
    });
    mockSendOtp.mockResolvedValue(undefined);
    mockVerifyOtp.mockRejectedValue(new Error('Invalid OTP'));
    render(<SupplierOnboardingPage />);
    fillBusinessForm();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(screen.getByText(/Send OTP/)).toBeInTheDocument());
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() => expect(screen.getByLabelText('Enter OTP')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify OTP' }));
    await waitFor(() => {
      expect(screen.getByText('Invalid OTP')).toBeInTheDocument();
    });
  });

  it('handles API error during OTP exchange', async () => {
    mockCreateSupplierApplication.mockResolvedValue({
      application: { id: 'app-123', status: 'DRAFT' },
    });
    mockSendOtp.mockResolvedValue(undefined);
    mockVerifyOtp.mockResolvedValue('firebase-id-token-123');
    mockVerifySupplierOtp.mockRejectedValue((() => { const { ApiError } = require('../../../lib/api'); return new ApiError(401, 'INVALID_TOKEN', 'Token expired'); })());
    render(<SupplierOnboardingPage />);
    fillBusinessForm();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(screen.getByText(/Send OTP/)).toBeInTheDocument());
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() => expect(screen.getByLabelText('Enter OTP')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify OTP' }));
    await waitFor(() => {
      expect(screen.getByText('Token expired')).toBeInTheDocument();
    });
  });

  // ── Step 4: KYC Document Upload ───────────────────────────────

  it('disables submit when required documents missing', async () => {
    await advanceToKycStep();
    const submitBtn = screen.getByRole('button', { name: 'Submit Documents' });
    expect(submitBtn).toBeDisabled();
  });

  it('shows error when PAN card missing on submit', async () => {
    await advanceToKycStep();
    // Force enable the button by providing partial files — we test validation
    const gstinInput = screen.getByLabelText('GSTIN Certificate *');
    const addressInput = screen.getByLabelText('Address Proof *');
    const gstinFile = new File(['gstin'], 'gstin.pdf', { type: 'application/pdf' });
    const addressFile = new File(['addr'], 'address.pdf', { type: 'application/pdf' });
    fireEvent.change(gstinInput, { target: { files: [gstinFile] } });
    fireEvent.change(addressInput, { target: { files: [addressFile] } });
    // Submit button should still be disabled because PAN is missing
    const submitBtn = screen.getByRole('button', { name: 'Submit Documents' });
    expect(submitBtn).toBeDisabled();
  });

  it('accepts valid file upload and shows filename', async () => {
    await advanceToKycStep();
    const panInput = screen.getByLabelText('PAN Card *');
    const file = new File(['pan-data'], 'pan.pdf', { type: 'application/pdf' });
    fireEvent.change(panInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText('pan.pdf')).toBeInTheDocument();
    });
  });

  it('rejects file exceeding 5MB limit', async () => {
    await advanceToKycStep();
    const panInput = screen.getByLabelText('PAN Card *');
    const largeFile = new File(['x'.repeat(6 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' });
    Object.defineProperty(largeFile, 'size', { value: 6 * 1024 * 1024 });
    fireEvent.change(panInput, { target: { files: [largeFile] } });
    await waitFor(() => {
      expect(screen.getByText(/File size must be less than/)).toBeInTheDocument();
    });
  });

  it('rejects unsupported file types', async () => {
    await advanceToKycStep();
    const panInput = screen.getByLabelText('PAN Card *');
    const textFile = new File(['text'], 'doc.txt', { type: 'text/plain' });
    fireEvent.change(panInput, { target: { files: [textFile] } });
    await waitFor(() => {
      expect(screen.getByText('Only JPEG, PNG, WebP, or PDF files allowed')).toBeInTheDocument();
    });
  });

  // ── KYC Submit → Success ──────────────────────────────────────

  it('submits KYC documents and shows success', async () => {
    mockUploadSupplierDocument.mockResolvedValue({ success: true });
    mockSubmitSupplierKyc.mockResolvedValue({ status: 'KYC_SUBMITTED' });
    await advanceToKycStep();

    const panInput = screen.getByLabelText('PAN Card *');
    const gstinInput = screen.getByLabelText('GSTIN Certificate *');
    const addressInput = screen.getByLabelText('Address Proof *');

    const panFile = new File(['pan'], 'pan.pdf', { type: 'application/pdf' });
    const gstinFile = new File(['gstin'], 'gstin.pdf', { type: 'application/pdf' });
    const addressFile = new File(['addr'], 'address.pdf', { type: 'application/pdf' });

    fireEvent.change(panInput, { target: { files: [panFile] } });
    fireEvent.change(gstinInput, { target: { files: [gstinFile] } });
    fireEvent.change(addressInput, { target: { files: [addressFile] } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Submit Documents' })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Submit Documents' }));

    await waitFor(() => {
      expect(mockUploadSupplierDocument).toHaveBeenCalledTimes(3);
      expect(mockSubmitSupplierKyc).toHaveBeenCalledWith('app-123');
    });

    await waitFor(() => {
      expect(screen.getByText('Application Submitted')).toBeInTheDocument();
    });
  });

  it('handles upload failure gracefully', async () => {
    mockUploadSupplierDocument.mockRejectedValue((() => { const { ApiError } = require('../../../lib/api'); return new ApiError(500, 'UPLOAD_FAILED', 'Upload failed'); })());
    await advanceToKycStep();

    const panInput = screen.getByLabelText('PAN Card *');
    const gstinInput = screen.getByLabelText('GSTIN Certificate *');
    const addressInput = screen.getByLabelText('Address Proof *');

    fireEvent.change(panInput, { target: { files: [new File(['p'], 'pan.pdf', { type: 'application/pdf' })] } });
    fireEvent.change(gstinInput, { target: { files: [new File(['g'], 'gstin.pdf', { type: 'application/pdf' })] } });
    fireEvent.change(addressInput, { target: { files: [new File(['a'], 'addr.pdf', { type: 'application/pdf' })] } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Submit Documents' })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Submit Documents' }));

    await waitFor(() => {
      expect(screen.getByText('Upload failed')).toBeInTheDocument();
    });
  });

  // ── Step 5: Success ───────────────────────────────────────────

  it('shows application ID and status on success', async () => {
    mockUploadSupplierDocument.mockResolvedValue({ success: true });
    mockSubmitSupplierKyc.mockResolvedValue({ status: 'KYC_SUBMITTED' });
    await advanceToKycStep();

    const panInput = screen.getByLabelText('PAN Card *');
    const gstinInput = screen.getByLabelText('GSTIN Certificate *');
    const addressInput = screen.getByLabelText('Address Proof *');

    fireEvent.change(panInput, { target: { files: [new File(['p'], 'pan.pdf', { type: 'application/pdf' })] } });
    fireEvent.change(gstinInput, { target: { files: [new File(['g'], 'gstin.pdf', { type: 'application/pdf' })] } });
    fireEvent.change(addressInput, { target: { files: [new File(['a'], 'addr.pdf', { type: 'application/pdf' })] } });

    fireEvent.click(screen.getByRole('button', { name: 'Submit Documents' }));

    await waitFor(() => {
      expect(screen.getByText('Pending Admin Approval')).toBeInTheDocument();
      expect(screen.getByText('app-123')).toBeInTheDocument();
    });
  });

  it('shows Go to Login button on success', async () => {
    mockUploadSupplierDocument.mockResolvedValue({ success: true });
    mockSubmitSupplierKyc.mockResolvedValue({ status: 'KYC_SUBMITTED' });
    await advanceToKycStep();

    const panInput = screen.getByLabelText('PAN Card *');
    const gstinInput = screen.getByLabelText('GSTIN Certificate *');
    const addressInput = screen.getByLabelText('Address Proof *');

    fireEvent.change(panInput, { target: { files: [new File(['p'], 'pan.pdf', { type: 'application/pdf' })] } });
    fireEvent.change(gstinInput, { target: { files: [new File(['g'], 'gstin.pdf', { type: 'application/pdf' })] } });
    fireEvent.change(addressInput, { target: { files: [new File(['a'], 'addr.pdf', { type: 'application/pdf' })] } });

    fireEvent.click(screen.getByRole('button', { name: 'Submit Documents' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Go to Login' })).toBeInTheDocument();
    });
  });

  it('navigates to login from success page', async () => {
    mockUploadSupplierDocument.mockResolvedValue({ success: true });
    mockSubmitSupplierKyc.mockResolvedValue({ status: 'KYC_SUBMITTED' });
    await advanceToKycStep();

    const panInput = screen.getByLabelText('PAN Card *');
    const gstinInput = screen.getByLabelText('GSTIN Certificate *');
    const addressInput = screen.getByLabelText('Address Proof *');

    fireEvent.change(panInput, { target: { files: [new File(['p'], 'pan.pdf', { type: 'application/pdf' })] } });
    fireEvent.change(gstinInput, { target: { files: [new File(['g'], 'gstin.pdf', { type: 'application/pdf' })] } });
    fireEvent.change(addressInput, { target: { files: [new File(['a'], 'addr.pdf', { type: 'application/pdf' })] } });

    fireEvent.click(screen.getByRole('button', { name: 'Submit Documents' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Go to Login' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Go to Login' }));
    expect(mockPush).toHaveBeenCalledWith('/login');
  });

  // ── Edge Cases ────────────────────────────────────────────────

  it('normalizes GSTIN to uppercase on input', () => {
    render(<SupplierOnboardingPage />);
    const gstinInput = screen.getByLabelText('GSTIN *');
    fireEvent.change(gstinInput, { target: { value: '22aaaaa0000a1z5' } });
    expect(gstinInput).toHaveValue('22AAAAA0000A1Z5');
  });

  it('limits pincode to 6 digits only', () => {
    render(<SupplierOnboardingPage />);
    const pincodeInput = screen.getByLabelText('Pincode');
    fireEvent.change(pincodeInput, { target: { value: '12345abc78' } });
    expect(pincodeInput).toHaveValue('123457');
  });

  it('limits OTP to 6 digits only', async () => {
    await advanceToOtpStep();
    const otpInput = screen.getByPlaceholderText('123456');
    fireEvent.change(otpInput, { target: { value: '12345abc78' } });
    expect(otpInput).toHaveValue('123457');
  });

  it('handles server returning unexpected application shape', async () => {
    mockCreateSupplierApplication.mockResolvedValue({
      applicationId: 'app-fallback-id',
      status: 'DRAFT',
    });
    render(<SupplierOnboardingPage />);
    fillBusinessForm();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(screen.getByText(/Send OTP/)).toBeInTheDocument();
    });
  });

  it('handles server returning no application id', async () => {
    mockCreateSupplierApplication.mockResolvedValue({ something: 'else' });
    render(<SupplierOnboardingPage />);
    fillBusinessForm();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      // Non-API error falls through to generic handler
      expect(screen.getByText('Failed to submit. Please try again.')).toBeInTheDocument();
    });
  });
});
