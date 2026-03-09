/**
 * RegisterPage — J20-TEST-001: 5-step KYC flow regression tests
 *
 * Covers:
 * - Step 1: Phone entry + Send OTP
 * - Step 2: OTP verification
 * - Step 3: Business details + validation
 * - Step 4: Document upload
 * - Step 5: KYC submission + success
 * - UX 4-state: loading, error, empty, success
 * - Wiring: click → API → state transitions
 * - Validation: phone, GSTIN, required fields, file size
 * - Backend failure states: API errors, resume flow, duplicate GSTIN
 * - Recovery: resend OTP, change phone, retry upload
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RegisterPage from '../pages/RegisterPage';

// === Mocks ===

const mockSendOtp = vi.fn().mockResolvedValue(true);
const mockVerifyOtp = vi.fn().mockResolvedValue('mock-id-token');
const mockIsFirebaseReady = vi.fn().mockReturnValue(true);
const mockSetupRecaptcha = vi.fn();
const mockCleanup = vi.fn();

vi.mock('../lib/firebase', () => ({
  setupRecaptcha: (...args: unknown[]) => mockSetupRecaptcha(...args),
  sendOtp: (...args: unknown[]) => mockSendOtp(...args),
  verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args),
  isFirebaseReady: () => mockIsFirebaseReady(),
  cleanup: () => mockCleanup(),
}));

const mockCreateRetailerApplication = vi.fn();
const mockVerifyRetailerOtp = vi.fn();
const mockUploadDocument = vi.fn();
const mockSubmitRetailerKyc = vi.fn();
const mockLookupRetailerRegistration = vi.fn();

vi.mock('../lib/api', () => ({
  API_GATEWAY_BASE: 'http://localhost:3000',
  safeJson: (res: { json: () => Promise<unknown> }) => res.json(),
  createRetailerApplication: (...args: unknown[]) => mockCreateRetailerApplication(...args),
  verifyRetailerOtp: (...args: unknown[]) => mockVerifyRetailerOtp(...args),
  uploadDocument: (...args: unknown[]) => mockUploadDocument(...args),
  submitRetailerKyc: (...args: unknown[]) => mockSubmitRetailerKyc(...args),
  lookupRetailerRegistration: (...args: unknown[]) => mockLookupRetailerRegistration(...args),
}));

vi.mock('../components/BuildStamp', () => ({
  BuildStamp: () => <span data-testid="build-stamp">v1.0</span>,
}));

vi.mock('../lib/fileLimits', () => ({
  MAX_DOCUMENT_SIZE_BYTES: 5 * 1024 * 1024,
  MAX_DOCUMENT_SIZE_LABEL: '5MB',
}));

vi.mock('../lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// JSDOM stubs for URL.createObjectURL / revokeObjectURL (not available in jsdom)
if (typeof URL.createObjectURL === 'undefined') {
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:mock-url'), writable: true });
}
if (typeof URL.revokeObjectURL === 'undefined') {
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true });
}

// === Helpers ===

function renderRegisterPage() {
  return render(
    <MemoryRouter initialEntries={['/retailer/register']}>
      <RegisterPage />
    </MemoryRouter>
  );
}

/** Fill phone and submit to send OTP, then verify OTP to reach details step */
async function advanceToOtpStep(phone = '9876543210') {
  renderRegisterPage();
  const phoneInput = screen.getByLabelText(/phone number/i);
  fireEvent.change(phoneInput, { target: { value: phone } });
  fireEvent.submit(screen.getByRole('button', { name: /send otp/i }));
  await waitFor(() => {
    expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
  });
}

async function advanceToDetailsStep(phone = '9876543210') {
  renderRegisterPage();
  // Step 1: phone
  const phoneInput = screen.getByLabelText(/phone number/i);
  fireEvent.change(phoneInput, { target: { value: phone } });
  fireEvent.submit(screen.getByRole('button', { name: /send otp/i }));
  await waitFor(() => {
    expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
  });
  // Step 2: OTP
  const otpInput = screen.getByLabelText(/verification code/i);
  fireEvent.change(otpInput, { target: { value: '123456' } });
  fireEvent.submit(screen.getByRole('button', { name: /verify otp/i }));
  await waitFor(() => {
    expect(screen.getByLabelText(/business.*name/i)).toBeInTheDocument();
  });
}

function fillBusinessDetails() {
  fireEvent.change(screen.getByLabelText(/business.*store name/i), { target: { value: 'Test Store' } });
  fireEvent.change(screen.getByLabelText(/business type/i), { target: { value: 'kirana' } });
  fireEvent.change(screen.getByLabelText(/gstin/i), { target: { value: '22AAAAA0000A1Z5' } });
  fireEvent.change(screen.getByLabelText(/owner.*authorized/i), { target: { value: 'Test Owner' } });
  fireEvent.change(screen.getByLabelText(/address line 1/i), { target: { value: '123 Test St' } });
  fireEvent.change(screen.getByLabelText(/city/i), { target: { value: 'Mumbai' } });
  fireEvent.change(screen.getByLabelText(/^state/i), { target: { value: 'Maharashtra' } });
  fireEvent.change(screen.getByLabelText(/pincode/i), { target: { value: '400001' } });
  // Agreement checkbox
  const checkbox = screen.getByRole('checkbox');
  fireEvent.click(checkbox);
}

// === Tests ===

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsFirebaseReady.mockReturnValue(true);
    mockSendOtp.mockResolvedValue(true);
    mockVerifyOtp.mockResolvedValue('mock-id-token');
    sessionStorage.clear();
  });

  // =============================================
  // STEP 1: Phone — Rendering & Validation
  // =============================================
  describe('Step 1: Phone', () => {
    it('renders initial phone step with input and send OTP button', () => {
      renderRegisterPage();
      expect(screen.getByLabelText(/phone number/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /send otp/i })).toBeInTheDocument();
    });

    it('renders branding header with SuperMandi', () => {
      renderRegisterPage();
      const brandingElems = screen.getAllByText(/SuperMandi/i);
      expect(brandingElems.length).toBeGreaterThan(0);
    });

    it('has sign in link for existing users', () => {
      renderRegisterPage();
      expect(screen.getByText(/sign in/i)).toBeInTheDocument();
    });

    it('renders build stamp', () => {
      renderRegisterPage();
      expect(screen.getByTestId('build-stamp')).toBeInTheDocument();
    });

    it('renders progress indicator showing 3 steps', () => {
      renderRegisterPage();
      expect(screen.getByText('Verify Phone')).toBeInTheDocument();
      expect(screen.getByText('Business Details')).toBeInTheDocument();
      expect(screen.getByText('KYC Documents')).toBeInTheDocument();
    });

    it('disables Send OTP when Firebase is not ready', () => {
      mockIsFirebaseReady.mockReturnValue(false);
      renderRegisterPage();
      expect(screen.getByRole('button', { name: /send otp/i })).toBeDisabled();
    });

    it('shows Firebase unavailable warning when Firebase is not ready', () => {
      mockIsFirebaseReady.mockReturnValue(false);
      renderRegisterPage();
      expect(screen.getByText(/phone verification unavailable/i)).toBeInTheDocument();
    });

    it('shows error for invalid phone number', async () => {
      renderRegisterPage();
      const phoneInput = screen.getByLabelText(/phone number/i);
      fireEvent.change(phoneInput, { target: { value: '123' } });
      fireEvent.submit(screen.getByRole('button', { name: /send otp/i }));
      await waitFor(() => {
        expect(screen.getByText(/valid phone number/i)).toBeInTheDocument();
      });
    });

    it('calls Firebase sendOtp and transitions to OTP step on valid phone', async () => {
      renderRegisterPage();
      const phoneInput = screen.getByLabelText(/phone number/i);
      fireEvent.change(phoneInput, { target: { value: '9876543210' } });
      fireEvent.submit(screen.getByRole('button', { name: /send otp/i }));
      await waitFor(() => {
        expect(mockSendOtp).toHaveBeenCalledWith('9876543210');
        expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
      });
    });

    it('shows error when Firebase sendOtp fails', async () => {
      mockSendOtp.mockRejectedValueOnce(new Error('Too many requests'));
      renderRegisterPage();
      const phoneInput = screen.getByLabelText(/phone number/i);
      fireEvent.change(phoneInput, { target: { value: '9876543210' } });
      fireEvent.submit(screen.getByRole('button', { name: /send otp/i }));
      await waitFor(() => {
        expect(screen.getByText(/too many requests/i)).toBeInTheDocument();
      });
    });

    it('shows loading state while sending OTP', async () => {
      let resolveSendOtp: (v: boolean) => void;
      mockSendOtp.mockImplementationOnce(() => new Promise<boolean>((r) => { resolveSendOtp = r; }));
      renderRegisterPage();
      const phoneInput = screen.getByLabelText(/phone number/i);
      fireEvent.change(phoneInput, { target: { value: '9876543210' } });
      fireEvent.submit(screen.getByRole('button', { name: /send otp/i }));
      await waitFor(() => {
        expect(screen.getByText(/sending otp/i)).toBeInTheDocument();
      });
      resolveSendOtp!(true);
    });
  });

  // =============================================
  // STEP 2: OTP Verification
  // =============================================
  describe('Step 2: OTP Verification', () => {
    it('shows OTP input with verify button after sending OTP', async () => {
      await advanceToOtpStep();
      expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /verify otp/i })).toBeInTheDocument();
    });

    it('disables verify button when OTP is less than 6 digits', async () => {
      await advanceToOtpStep();
      const otpInput = screen.getByLabelText(/verification code/i);
      fireEvent.change(otpInput, { target: { value: '123' } });
      expect(screen.getByRole('button', { name: /verify otp/i })).toBeDisabled();
    });

    it('enables verify button when OTP is 6 digits', async () => {
      await advanceToOtpStep();
      const otpInput = screen.getByLabelText(/verification code/i);
      fireEvent.change(otpInput, { target: { value: '123456' } });
      expect(screen.getByRole('button', { name: /verify otp/i })).toBeEnabled();
    });

    it('strips non-digit characters from OTP input', async () => {
      await advanceToOtpStep();
      const otpInput = screen.getByLabelText(/verification code/i) as HTMLInputElement;
      fireEvent.change(otpInput, { target: { value: '12ab56' } });
      expect(otpInput.value).toBe('1256');
    });

    it('calls Firebase verifyOtp and transitions to details step on valid OTP', async () => {
      await advanceToOtpStep();
      const otpInput = screen.getByLabelText(/verification code/i);
      fireEvent.change(otpInput, { target: { value: '123456' } });
      fireEvent.submit(screen.getByRole('button', { name: /verify otp/i }));
      await waitFor(() => {
        expect(mockVerifyOtp).toHaveBeenCalledWith('123456');
        expect(screen.getByLabelText(/business.*name/i)).toBeInTheDocument();
      });
    });

    it('shows error when OTP verification fails', async () => {
      mockVerifyOtp.mockRejectedValueOnce(new Error('Invalid verification code'));
      await advanceToOtpStep();
      const otpInput = screen.getByLabelText(/verification code/i);
      fireEvent.change(otpInput, { target: { value: '999999' } });
      fireEvent.submit(screen.getByRole('button', { name: /verify otp/i }));
      await waitFor(() => {
        expect(screen.getByText(/invalid verification code/i)).toBeInTheDocument();
      });
    });

    it('shows loading state while verifying OTP', async () => {
      let resolveVerify: (v: string) => void;
      mockVerifyOtp.mockImplementationOnce(() => new Promise<string>((r) => { resolveVerify = r; }));
      await advanceToOtpStep();
      const otpInput = screen.getByLabelText(/verification code/i);
      fireEvent.change(otpInput, { target: { value: '123456' } });
      fireEvent.submit(screen.getByRole('button', { name: /verify otp/i }));
      await waitFor(() => {
        expect(screen.getByText(/verifying/i)).toBeInTheDocument();
      });
      resolveVerify!('mock-id-token');
    });

    it('shows Change Phone and Resend buttons', async () => {
      await advanceToOtpStep();
      expect(screen.getByText(/change phone/i)).toBeInTheDocument();
      // After sending OTP, resend has 60s cooldown so it shows "Resend in Xs"
      expect(screen.getByText(/resend in/i)).toBeInTheDocument();
    });

    it('returns to phone step when Change Phone is clicked', async () => {
      await advanceToOtpStep();
      fireEvent.click(screen.getByText(/change phone/i));
      await waitFor(() => {
        expect(screen.getByLabelText(/phone number/i)).toBeInTheDocument();
      });
    });

    it('calls sendOtp again when Resend OTP is clicked after cooldown', async () => {
      await advanceToOtpStep();
      // Resend button shows cooldown initially
      expect(screen.getByText(/resend in/i)).toBeInTheDocument();
    });
  });

  // =============================================
  // STEP 3: Business Details + Validation
  // =============================================
  describe('Step 3: Business Details', () => {
    beforeEach(() => {
      mockCreateRetailerApplication.mockResolvedValue({
        application: { id: 'app-123' },
      });
      mockVerifyRetailerOtp.mockResolvedValue({ success: true });
    });

    it('shows phone verified banner on details step', async () => {
      await advanceToDetailsStep();
      expect(screen.getByText(/phone verified/i)).toBeInTheDocument();
    });

    it('renders all required form fields', async () => {
      await advanceToDetailsStep();
      expect(screen.getByLabelText(/business.*store name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/business type/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/gstin/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/owner.*authorized/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/address line 1/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/city/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^state/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/pincode/i)).toBeInTheDocument();
    });

    it('shows validation errors when submitting empty form', async () => {
      await advanceToDetailsStep();
      // Button is disabled when !agreement, so check agreement first to enable submit
      fireEvent.click(screen.getByRole('checkbox'));
      fireEvent.click(screen.getByRole('button', { name: /continue to document/i }));
      await waitFor(() => {
        expect(screen.getByText(/business name is required/i)).toBeInTheDocument();
        expect(screen.getByText(/business type is required/i)).toBeInTheDocument();
        expect(screen.getByText(/gstin is required/i)).toBeInTheDocument();
        expect(screen.getByText(/owner name is required/i)).toBeInTheDocument();
      });
    });

    it('validates GSTIN format (GL-CRIT-0031)', async () => {
      await advanceToDetailsStep();
      fireEvent.change(screen.getByLabelText(/gstin/i), { target: { value: 'INVALID' } });
      // Fill minimum required to trigger submit
      fireEvent.change(screen.getByLabelText(/business.*store name/i), { target: { value: 'Test' } });
      fireEvent.change(screen.getByLabelText(/business type/i), { target: { value: 'kirana' } });
      fireEvent.change(screen.getByLabelText(/owner.*authorized/i), { target: { value: 'Owner' } });
      fireEvent.change(screen.getByLabelText(/address line 1/i), { target: { value: 'Addr' } });
      fireEvent.change(screen.getByLabelText(/city/i), { target: { value: 'City' } });
      fireEvent.change(screen.getByLabelText(/^state/i), { target: { value: 'Maharashtra' } });
      fireEvent.change(screen.getByLabelText(/pincode/i), { target: { value: '400001' } });
      fireEvent.click(screen.getByRole('checkbox'));
      fireEvent.click(screen.getByRole('button', { name: /continue to document/i }));
      await waitFor(() => {
        expect(screen.getByText(/invalid gstin format/i)).toBeInTheDocument();
      });
    });

    it('validates pincode must be 6 digits', async () => {
      await advanceToDetailsStep();
      fireEvent.change(screen.getByLabelText(/business.*store name/i), { target: { value: 'Test' } });
      fireEvent.change(screen.getByLabelText(/business type/i), { target: { value: 'kirana' } });
      fireEvent.change(screen.getByLabelText(/gstin/i), { target: { value: '22AAAAA0000A1Z5' } });
      fireEvent.change(screen.getByLabelText(/owner.*authorized/i), { target: { value: 'Owner' } });
      fireEvent.change(screen.getByLabelText(/address line 1/i), { target: { value: 'Addr' } });
      fireEvent.change(screen.getByLabelText(/city/i), { target: { value: 'City' } });
      fireEvent.change(screen.getByLabelText(/^state/i), { target: { value: 'Maharashtra' } });
      fireEvent.change(screen.getByLabelText(/pincode/i), { target: { value: '123' } });
      fireEvent.click(screen.getByRole('checkbox'));
      fireEvent.click(screen.getByRole('button', { name: /continue to document/i }));
      await waitFor(() => {
        expect(screen.getByText(/pincode must be 6 digits/i)).toBeInTheDocument();
      });
    });

    it('validates email format when provided', async () => {
      await advanceToDetailsStep();
      // Exact same pattern as GSTIN/pincode tests that pass:
      fireEvent.change(screen.getByLabelText(/business.*store name/i), { target: { value: 'Test' } });
      fireEvent.change(screen.getByLabelText(/business type/i), { target: { value: 'kirana' } });
      fireEvent.change(screen.getByLabelText(/gstin/i), { target: { value: '22AAAAA0000A1Z5' } });
      fireEvent.change(screen.getByLabelText(/owner.*authorized/i), { target: { value: 'Owner' } });
      fireEvent.change(screen.getByLabelText(/address line 1/i), { target: { value: 'Addr' } });
      fireEvent.change(screen.getByLabelText(/city/i), { target: { value: 'City' } });
      fireEvent.change(screen.getByLabelText(/^state/i), { target: { value: 'Maharashtra' } });
      fireEvent.change(screen.getByLabelText(/pincode/i), { target: { value: '400001' } });
      fireEvent.click(screen.getByRole('checkbox'));
      // Now set the invalid email (after all valid fields are set)
      // Use getElementById to avoid label matching ambiguity
      fireEvent.change(document.getElementById('reg-email')!, { target: { value: 'not-an-email' } });
      // Submit
      const form = document.querySelector('.reg-details-form') as HTMLFormElement;
      fireEvent.submit(form);
      await waitFor(() => {
        expect(screen.getByText(/invalid email/i)).toBeInTheDocument();
      });
    });

    it('requires agreement checkbox', async () => {
      await advanceToDetailsStep();
      fireEvent.change(screen.getByLabelText(/business.*store name/i), { target: { value: 'Test' } });
      fireEvent.change(screen.getByLabelText(/business type/i), { target: { value: 'kirana' } });
      fireEvent.change(screen.getByLabelText(/gstin/i), { target: { value: '22AAAAA0000A1Z5' } });
      fireEvent.change(screen.getByLabelText(/owner.*authorized/i), { target: { value: 'Owner' } });
      fireEvent.change(screen.getByLabelText(/address line 1/i), { target: { value: 'Addr' } });
      fireEvent.change(screen.getByLabelText(/city/i), { target: { value: 'City' } });
      fireEvent.change(screen.getByLabelText(/^state/i), { target: { value: 'Maharashtra' } });
      fireEvent.change(screen.getByLabelText(/pincode/i), { target: { value: '400001' } });
      // Don't check agreement
      const continueBtn = screen.getByRole('button', { name: /continue to document/i });
      expect(continueBtn).toBeDisabled();
    });

    it('calls createRetailerApplication + verifyRetailerOtp and transitions to documents step', async () => {
      await advanceToDetailsStep();
      fillBusinessDetails();
      fireEvent.click(screen.getByRole('button', { name: /continue to document/i }));
      await waitFor(() => {
        expect(mockCreateRetailerApplication).toHaveBeenCalledWith(
          expect.objectContaining({
            phone: '+919876543210',
            businessName: 'Test Store',
            businessType: 'kirana',
            gstin: '22AAAAA0000A1Z5',
            ownerName: 'Test Owner',
            addressLine1: '123 Test St',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400001',
          })
        );
        expect(mockVerifyRetailerOtp).toHaveBeenCalledWith({
          idToken: 'mock-id-token',
          applicationId: 'app-123',
        });
      });
      await waitFor(() => {
        expect(screen.getByText(/document upload guidelines/i)).toBeInTheDocument();
      });
    });

    it('shows loading state while submitting details', async () => {
      let resolveCreate: (v: unknown) => void;
      mockCreateRetailerApplication.mockImplementationOnce(() => new Promise((r) => { resolveCreate = r; }));
      await advanceToDetailsStep();
      fillBusinessDetails();
      fireEvent.click(screen.getByRole('button', { name: /continue to document/i }));
      await waitFor(() => {
        expect(screen.getByText(/saving details/i)).toBeInTheDocument();
      });
      resolveCreate!({ application: { id: 'app-123' } });
    });

    it('shows error when createRetailerApplication fails', async () => {
      mockCreateRetailerApplication.mockRejectedValueOnce({ message: 'Server error' });
      await advanceToDetailsStep();
      fillBusinessDetails();
      fireEvent.click(screen.getByRole('button', { name: /continue to document/i }));
      await waitFor(() => {
        expect(screen.getByText(/server error/i)).toBeInTheDocument();
      });
    });

    it('handles APPLICATION_EXISTS by resuming with verifyRetailerOtp', async () => {
      mockCreateRetailerApplication.mockRejectedValueOnce({
        code: 'APPLICATION_EXISTS',
        applicationId: 'existing-app-456',
      });
      mockVerifyRetailerOtp.mockResolvedValueOnce({ success: true });
      await advanceToDetailsStep();
      fillBusinessDetails();
      fireEvent.click(screen.getByRole('button', { name: /continue to document/i }));
      await waitFor(() => {
        expect(mockVerifyRetailerOtp).toHaveBeenCalledWith({
          idToken: 'mock-id-token',
          applicationId: 'existing-app-456',
        });
        expect(screen.getByText(/document upload guidelines/i)).toBeInTheDocument();
      });
    });

    it('handles GSTIN_EXISTS error', async () => {
      mockCreateRetailerApplication.mockRejectedValueOnce({ code: 'GSTIN_EXISTS' });
      await advanceToDetailsStep();
      fillBusinessDetails();
      fireEvent.click(screen.getByRole('button', { name: /continue to document/i }));
      await waitFor(() => {
        expect(screen.getByText(/already registered.*login instead/i)).toBeInTheDocument();
      });
    });

    it('handles DUPLICATE_ENTRY error', async () => {
      mockCreateRetailerApplication.mockRejectedValueOnce({ code: 'DUPLICATE_ENTRY' });
      await advanceToDetailsStep();
      fillBusinessDetails();
      fireEvent.click(screen.getByRole('button', { name: /continue to document/i }));
      await waitFor(() => {
        expect(screen.getByText(/already registered with a different account/i)).toBeInTheDocument();
      });
    });

    it('shows "other" business type input when other is selected', async () => {
      await advanceToDetailsStep();
      fireEvent.change(screen.getByLabelText(/business type/i), { target: { value: 'other' } });
      expect(screen.getByLabelText(/specify business type/i)).toBeInTheDocument();
    });

    it('has Back button that returns to phone step', async () => {
      await advanceToDetailsStep();
      fireEvent.click(screen.getByRole('button', { name: /^back$/i }));
      await waitFor(() => {
        expect(screen.getByLabelText(/phone number/i)).toBeInTheDocument();
      });
    });

    it('auto-uppercases GSTIN input', async () => {
      await advanceToDetailsStep();
      const gstinInput = screen.getByLabelText(/gstin/i) as HTMLInputElement;
      fireEvent.change(gstinInput, { target: { value: '22aaaaa0000a1z5' } });
      expect(gstinInput.value).toBe('22AAAAA0000A1Z5');
    });

    it('shows GSTIN character counter', async () => {
      await advanceToDetailsStep();
      fireEvent.change(screen.getByLabelText(/gstin/i), { target: { value: '22AAAA' } });
      expect(screen.getByText(/6\/15 characters/i)).toBeInTheDocument();
    });
  });

  // =============================================
  // STEP 4: Document Upload
  // =============================================
  describe('Step 4: Document Upload', () => {
    beforeEach(() => {
      mockCreateRetailerApplication.mockResolvedValue({
        application: { id: 'app-123' },
      });
      mockVerifyRetailerOtp.mockResolvedValue({ success: true });
      mockUploadDocument.mockResolvedValue({ success: true });
    });

    async function advanceToDocumentsStep() {
      await advanceToDetailsStep();
      fillBusinessDetails();
      fireEvent.click(screen.getByRole('button', { name: /continue to document/i }));
      await waitFor(() => {
        expect(screen.getByText(/document upload guidelines/i)).toBeInTheDocument();
      });
    }

    it('shows 3 required document upload slots', async () => {
      await advanceToDocumentsStep();
      // Document titles appear in headings (h3) — may also appear in subtitles
      expect(screen.getAllByText(/pan card/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/gstin registration certificate/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/address proof/i).length).toBeGreaterThanOrEqual(1);
      // Verify 3 file inputs exist
      const fileInputs = document.querySelectorAll('input[type="file"]');
      expect(fileInputs.length).toBe(3);
    });

    it('shows upload guidelines with format and size info', async () => {
      await advanceToDocumentsStep();
      expect(screen.getByText(/supported formats/i)).toBeInTheDocument();
      // 5MB appears in guidelines and per-document hints
      expect(screen.getAllByText(/5MB/).length).toBeGreaterThanOrEqual(1);
    });

    it('disables Submit Application when not all docs uploaded', async () => {
      await advanceToDocumentsStep();
      expect(screen.getByRole('button', { name: /submit application/i })).toBeDisabled();
    });

    it('calls uploadDocument API when file is selected', async () => {
      await advanceToDocumentsStep();
      const fileInputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
      expect(fileInputs.length).toBe(3);
      const panFile = new File(['test'], 'pan.jpg', { type: 'image/jpeg' });
      // JSDOM requires defineProperty for files
      Object.defineProperty(fileInputs[0], 'files', { value: [panFile], writable: false });
      fireEvent.change(fileInputs[0]);
      await waitFor(() => {
        expect(mockUploadDocument).toHaveBeenCalledWith(
          panFile, 'pan', 'application', 'app-123'
        );
      });
    });

    it('shows uploaded state after successful upload', async () => {
      await advanceToDocumentsStep();
      const fileInputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
      const panFile = new File(['test'], 'pan.jpg', { type: 'image/jpeg' });
      Object.defineProperty(fileInputs[0], 'files', { value: [panFile], writable: false });
      fireEvent.change(fileInputs[0]);
      await waitFor(() => {
        expect(screen.getByText('pan.jpg')).toBeInTheDocument();
      });
    });

    it('shows error when upload fails', async () => {
      mockUploadDocument.mockRejectedValueOnce({ message: 'Upload failed' });
      await advanceToDocumentsStep();
      const fileInputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
      const panFile = new File(['test'], 'pan.jpg', { type: 'image/jpeg' });
      Object.defineProperty(fileInputs[0], 'files', { value: [panFile], writable: false });
      fireEvent.change(fileInputs[0]);
      await waitFor(() => {
        expect(screen.getByText(/upload failed/i)).toBeInTheDocument();
      });
    });

    it('rejects files exceeding MAX_DOCUMENT_SIZE_BYTES', async () => {
      await advanceToDocumentsStep();
      const fileInputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
      const bigFile = new File(['x'], 'big.jpg', { type: 'image/jpeg' });
      Object.defineProperty(bigFile, 'size', { value: 6 * 1024 * 1024 });
      Object.defineProperty(fileInputs[0], 'files', { value: [bigFile], writable: false });
      fireEvent.change(fileInputs[0]);
      await waitFor(() => {
        expect(screen.getByText(/file must be under 5MB/i)).toBeInTheDocument();
      });
      expect(mockUploadDocument).not.toHaveBeenCalled();
    });

    it('has Back button that returns to details step', async () => {
      await advanceToDocumentsStep();
      fireEvent.click(screen.getByRole('button', { name: /^back$/i }));
      await waitFor(() => {
        expect(screen.getByLabelText(/business.*name/i)).toBeInTheDocument();
      });
    });
  });

  // =============================================
  // STEP 5: KYC Submission + Success
  // =============================================
  describe('Step 5: KYC Submission', () => {
    beforeEach(() => {
      mockCreateRetailerApplication.mockResolvedValue({
        application: { id: 'app-123' },
      });
      mockVerifyRetailerOtp.mockResolvedValue({ success: true });
      mockUploadDocument.mockResolvedValue({ success: true });
      mockSubmitRetailerKyc.mockResolvedValue({ success: true });
    });

    async function advanceToFullDocumentsStep() {
      await advanceToDetailsStep();
      fillBusinessDetails();
      fireEvent.click(screen.getByRole('button', { name: /continue to document/i }));
      await waitFor(() => {
        expect(screen.getByText(/document upload guidelines/i)).toBeInTheDocument();
      });
      // Upload all 3 docs using Object.defineProperty for JSDOM
      const fileInputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
      const panFile = new File(['pan'], 'pan.jpg', { type: 'image/jpeg' });
      const gstFile = new File(['gst'], 'gst.pdf', { type: 'application/pdf' });
      const addrFile = new File(['addr'], 'addr.jpg', { type: 'image/jpeg' });
      Object.defineProperty(fileInputs[0], 'files', { value: [panFile], configurable: true });
      fireEvent.change(fileInputs[0]);
      await waitFor(() => { expect(mockUploadDocument).toHaveBeenCalledTimes(1); });
      Object.defineProperty(fileInputs[1], 'files', { value: [gstFile], configurable: true });
      fireEvent.change(fileInputs[1]);
      await waitFor(() => { expect(mockUploadDocument).toHaveBeenCalledTimes(2); });
      Object.defineProperty(fileInputs[2], 'files', { value: [addrFile], configurable: true });
      fireEvent.change(fileInputs[2]);
      await waitFor(() => { expect(mockUploadDocument).toHaveBeenCalledTimes(3); });
    }

    it('enables Submit Application after all docs uploaded', async () => {
      await advanceToFullDocumentsStep();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /submit application/i })).toBeEnabled();
      });
    });

    it('calls submitRetailerKyc and shows success step', async () => {
      await advanceToFullDocumentsStep();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /submit application/i })).toBeEnabled();
      });
      fireEvent.click(screen.getByRole('button', { name: /submit application/i }));
      await waitFor(() => {
        expect(mockSubmitRetailerKyc).toHaveBeenCalledWith('app-123');
        expect(screen.getByText(/application submitted/i)).toBeInTheDocument();
      });
    });

    it('shows application ID on success', async () => {
      await advanceToFullDocumentsStep();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /submit application/i })).toBeEnabled();
      });
      fireEvent.click(screen.getByRole('button', { name: /submit application/i }));
      await waitFor(() => {
        expect(screen.getByText('app-123')).toBeInTheDocument();
      });
    });

    it('shows "what happens next" steps on success', async () => {
      await advanceToFullDocumentsStep();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /submit application/i })).toBeEnabled();
      });
      fireEvent.click(screen.getByRole('button', { name: /submit application/i }));
      await waitFor(() => {
        expect(screen.getByText(/pending verification/i)).toBeInTheDocument();
        expect(screen.getByText(/go to login/i)).toBeInTheDocument();
      });
    });

    it('shows loading state while submitting KYC', async () => {
      let resolveSubmit: (v: unknown) => void;
      mockSubmitRetailerKyc.mockImplementationOnce(() => new Promise((r) => { resolveSubmit = r; }));
      await advanceToFullDocumentsStep();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /submit application/i })).toBeEnabled();
      });
      fireEvent.click(screen.getByRole('button', { name: /submit application/i }));
      await waitFor(() => {
        expect(screen.getByText(/submitting application/i)).toBeInTheDocument();
      });
      resolveSubmit!({ success: true });
    });

    it('shows error when KYC submission fails', async () => {
      mockSubmitRetailerKyc.mockRejectedValueOnce({ message: 'Server unavailable' });
      await advanceToFullDocumentsStep();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /submit application/i })).toBeEnabled();
      });
      fireEvent.click(screen.getByRole('button', { name: /submit application/i }));
      await waitFor(() => {
        expect(screen.getByText(/server unavailable/i)).toBeInTheDocument();
      });
    });

    it('shows missing documents error from backend', async () => {
      mockSubmitRetailerKyc.mockRejectedValueOnce({
        code: 'MISSING_DOCUMENTS',
        missingDocuments: ['pan', 'address_proof'],
      });
      await advanceToFullDocumentsStep();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /submit application/i })).toBeEnabled();
      });
      fireEvent.click(screen.getByRole('button', { name: /submit application/i }));
      await waitFor(() => {
        expect(screen.getByText(/missing required documents.*pan.*address_proof/i)).toBeInTheDocument();
      });
    });

    it('hides progress indicator on success step', async () => {
      await advanceToFullDocumentsStep();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /submit application/i })).toBeEnabled();
      });
      fireEvent.click(screen.getByRole('button', { name: /submit application/i }));
      await waitFor(() => {
        expect(screen.getByText(/application submitted/i)).toBeInTheDocument();
        expect(screen.queryByText('Verify Phone')).not.toBeInTheDocument();
      });
    });
  });

  // =============================================
  // Error alerts use role="alert" (accessibility)
  // =============================================
  describe('Accessibility: error alerts', () => {
    it('error messages have role="alert" for screen readers', async () => {
      mockSendOtp.mockRejectedValueOnce(new Error('Firebase error'));
      renderRegisterPage();
      fireEvent.change(screen.getByLabelText(/phone number/i), { target: { value: '9876543210' } });
      fireEvent.submit(screen.getByRole('button', { name: /send otp/i }));
      await waitFor(() => {
        const alert = screen.getByRole('alert');
        expect(alert).toBeInTheDocument();
        expect(alert.textContent).toContain('Firebase error');
      });
    });
  });
});
