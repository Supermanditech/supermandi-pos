import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ForgotPasswordPage from '../pages/ForgotPasswordPage';

// --- Mock setup (forwarding functions pattern from J20-TEST-001) ---
const mockSetupRecaptcha = vi.fn();
const mockSendOtp = vi.fn().mockResolvedValue(true);
const mockVerifyOtp = vi.fn().mockResolvedValue('mock-id-token');
const mockIsFirebaseReady = vi.fn().mockReturnValue(true);
const mockCleanup = vi.fn();

vi.mock('../lib/firebase', () => ({
  setupRecaptcha: (...args: unknown[]) => mockSetupRecaptcha(...args),
  sendOtp: (...args: unknown[]) => mockSendOtp(...args),
  verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args),
  isFirebaseReady: () => mockIsFirebaseReady(),
  cleanup: () => mockCleanup(),
}));

vi.mock('../lib/api', () => ({
  API_GATEWAY_BASE: 'http://localhost:3000',
  safeJson: (res: { json: () => Promise<unknown> }) => res.json(),
}));

vi.mock('../components/BuildStamp', () => ({
  BuildStamp: () => <span data-testid="build-stamp">v1.0</span>,
}));

vi.mock('../components/ThemeToggle', () => ({
  ThemeToggle: () => <button data-testid="theme-toggle">Theme</button>,
}));

// --- Helpers ---
function renderPage() {
  return render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);
}

function mockFetchSuccess(data: Record<string, unknown> = {}) {
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

function mockFetchError(message: string, status = 400) {
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: false,
    status,
    json: () => Promise.resolve({ error: { message } }),
  });
}

/** Navigate to OTP phone entry step */
function goToPhoneStep() {
  renderPage();
  fireEvent.click(screen.getByText('Reset via mobile OTP'));
}

/** Navigate to OTP verification step (phone → send OTP → otp step) */
async function goToOtpStep(phone = '9876543210') {
  goToPhoneStep();
  mockFetchSuccess(); // backend phone check
  const phoneInput = screen.getByLabelText(/phone number/i);
  fireEvent.change(phoneInput, { target: { value: phone } });
  fireEvent.click(screen.getByText('Send OTP'));
  await waitFor(() => {
    expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
  });
}

/** Navigate to OTP new password step (phone → OTP → verify → newPassword) */
async function goToNewPasswordStep(phone = '9876543210') {
  await goToOtpStep(phone);
  const otpInput = screen.getByLabelText(/verification code/i);
  fireEvent.change(otpInput, { target: { value: '123456' } });
  fireEvent.click(screen.getByText('Verify OTP'));
  await waitFor(() => {
    expect(document.getElementById('otpreset-new-password')).toBeInTheDocument();
  });
}

/** Navigate to email entry step */
function goToEmailStep() {
  renderPage();
  fireEvent.click(screen.getByText('Reset via email link'));
}

/** Navigate to emailSent step (email → send request → emailSent) */
async function goToEmailSentStep(email = 'test@example.com') {
  goToEmailStep();
  mockFetchSuccess();
  const emailInput = screen.getByLabelText(/email address/i);
  fireEvent.change(emailInput, { target: { value: email } });
  fireEvent.click(screen.getByText('Send Reset Link'));
  await waitFor(() => {
    expect(screen.getByText(/Check Your Email/i)).toBeInTheDocument();
  });
}

/** Navigate to emailReset step (email → send → emailSent → "I Have a Reset Token") */
async function goToEmailResetStep(email = 'test@example.com') {
  await goToEmailSentStep(email);
  fireEvent.click(screen.getByText('I Have a Reset Token'));
  await waitFor(() => {
    expect(document.getElementById('emailreset-token')).toBeInTheDocument();
  });
}

// ===========================================================================
describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    mockIsFirebaseReady.mockReturnValue(true);
    mockSendOtp.mockResolvedValue(true);
    mockVerifyOtp.mockResolvedValue('mock-id-token');
  });

  // =========================================================================
  // CHANNEL SELECTION (choose step)
  // =========================================================================
  describe('Channel Selection', () => {
    it('renders channel selector on initial load', () => {
      renderPage();
      expect(screen.getByText('Reset Password')).toBeInTheDocument();
      expect(screen.getByText(/Choose how you want to reset your password/)).toBeInTheDocument();
      expect(screen.getByText('Reset via mobile OTP')).toBeInTheDocument();
      expect(screen.getByText('Reset via email link')).toBeInTheDocument();
    });

    it('shows header with branding', () => {
      renderPage();
      expect(screen.getByText('SuperMandi')).toBeInTheDocument();
      expect(screen.getByText('Retailer Portal')).toBeInTheDocument();
    });

    it('shows sign in link on choose step', () => {
      renderPage();
      expect(screen.getByText('Sign In')).toBeInTheDocument();
      expect(screen.getByText(/Remember your password/)).toBeInTheDocument();
    });

    it('navigates to OTP channel on button click', () => {
      renderPage();
      fireEvent.click(screen.getByText('Reset via mobile OTP'));
      expect(screen.getByText(/Enter your registered phone number/)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/98765 43210/)).toBeInTheDocument();
      expect(screen.getByText('Send OTP')).toBeInTheDocument();
    });

    it('navigates to email channel on button click', () => {
      renderPage();
      fireEvent.click(screen.getByText('Reset via email link'));
      expect(screen.getByText(/Enter your registered email address/)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/you@example.com/)).toBeInTheDocument();
      expect(screen.getByText('Send Reset Link')).toBeInTheDocument();
    });

    it('renders footer with copyright and build stamp', () => {
      renderPage();
      expect(screen.getByText(/SuperMandi Tech Pvt Ltd/)).toBeInTheDocument();
      expect(screen.getByText(new RegExp(String(new Date().getFullYear())))).toBeInTheDocument();
      expect(screen.getByTestId('build-stamp')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // OTP CHANNEL: PHONE ENTRY
  // =========================================================================
  describe('OTP Channel — Phone Entry', () => {
    it('shows phone input with label', () => {
      goToPhoneStep();
      expect(screen.getByLabelText(/phone number/i)).toBeInTheDocument();
    });

    it('shows "Use a different method" link back to choose step', () => {
      goToPhoneStep();
      fireEvent.click(screen.getByText(/Use a different method/i));
      expect(screen.getByText(/Choose how you want to reset your password/)).toBeInTheDocument();
    });

    it('validates invalid phone number format', async () => {
      goToPhoneStep();
      const phoneInput = screen.getByLabelText(/phone number/i);
      fireEvent.change(phoneInput, { target: { value: '123' } });
      fireEvent.click(screen.getByText('Send OTP'));
      await waitFor(() => {
        expect(screen.getByText(/valid phone number/i)).toBeInTheDocument();
      });
    });

    it('accepts valid 10-digit phone and sends OTP', async () => {
      goToPhoneStep();
      mockFetchSuccess(); // backend phone check OK
      const phoneInput = screen.getByLabelText(/phone number/i);
      fireEvent.change(phoneInput, { target: { value: '9876543210' } });
      fireEvent.click(screen.getByText('Send OTP'));
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/forgot-password/request'),
          expect.objectContaining({ method: 'POST' })
        );
      });
      await waitFor(() => {
        expect(mockSendOtp).toHaveBeenCalledWith('+919876543210');
      });
    });

    it('shows loading state while sending OTP', async () => {
      goToPhoneStep();
      // Make fetch hang
      (global.fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(new Promise(() => {}));
      const phoneInput = screen.getByLabelText(/phone number/i);
      fireEvent.change(phoneInput, { target: { value: '9876543210' } });
      fireEvent.click(screen.getByText('Send OTP'));
      await waitFor(() => {
        expect(screen.getByText('Sending OTP...')).toBeInTheDocument();
      });
    });

    it('shows error when backend rejects phone (account not found)', async () => {
      goToPhoneStep();
      mockFetchError('Account not found');
      const phoneInput = screen.getByLabelText(/phone number/i);
      fireEvent.change(phoneInput, { target: { value: '9876543210' } });
      fireEvent.click(screen.getByText('Send OTP'));
      await waitFor(() => {
        expect(screen.getByText('Account not found')).toBeInTheDocument();
      });
    });

    it('shows error when Firebase sendOtp fails', async () => {
      goToPhoneStep();
      mockFetchSuccess(); // backend OK
      mockSendOtp.mockRejectedValueOnce(new Error('Firebase OTP send failed'));
      const phoneInput = screen.getByLabelText(/phone number/i);
      fireEvent.change(phoneInput, { target: { value: '9876543210' } });
      fireEvent.click(screen.getByText('Send OTP'));
      await waitFor(() => {
        expect(screen.getByText('Firebase OTP send failed')).toBeInTheDocument();
      });
    });

    it('shows error when Firebase is not ready', () => {
      mockIsFirebaseReady.mockReturnValue(false);
      goToPhoneStep();
      // Send OTP button should be disabled
      const sendBtn = screen.getByText('Send OTP');
      expect(sendBtn).toBeDisabled();
    });

    it('transitions to OTP step after successful send', async () => {
      goToPhoneStep();
      mockFetchSuccess();
      const phoneInput = screen.getByLabelText(/phone number/i);
      fireEvent.change(phoneInput, { target: { value: '9876543210' } });
      fireEvent.click(screen.getByText('Send OTP'));
      await waitFor(() => {
        expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // OTP CHANNEL: OTP VERIFICATION
  // =========================================================================
  describe('OTP Channel — OTP Verification', () => {
    it('shows OTP input and verify button', async () => {
      await goToOtpStep();
      expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
      expect(screen.getByText('Verify OTP')).toBeInTheDocument();
    });

    it('verify button is disabled until 6 digits entered', async () => {
      await goToOtpStep();
      const verifyBtn = screen.getByText('Verify OTP');
      expect(verifyBtn).toBeDisabled();
      const otpInput = screen.getByLabelText(/verification code/i);
      fireEvent.change(otpInput, { target: { value: '12345' } });
      expect(verifyBtn).toBeDisabled();
      fireEvent.change(otpInput, { target: { value: '123456' } });
      expect(verifyBtn).not.toBeDisabled();
    });

    it('strips non-digit characters from OTP input', async () => {
      await goToOtpStep();
      const otpInput = screen.getByLabelText(/verification code/i) as HTMLInputElement;
      fireEvent.change(otpInput, { target: { value: '12ab34' } });
      expect(otpInput.value).toBe('1234');
    });

    it('shows resend cooldown after OTP is sent', async () => {
      await goToOtpStep();
      expect(screen.getByText(/Resend in/i)).toBeInTheDocument();
    });

    it('shows change phone link', async () => {
      await goToOtpStep();
      expect(screen.getByText('Change Phone')).toBeInTheDocument();
    });

    it('navigates back to phone step on Change Phone click', async () => {
      await goToOtpStep();
      fireEvent.click(screen.getByText('Change Phone'));
      await waitFor(() => {
        expect(screen.getByLabelText(/phone number/i)).toBeInTheDocument();
      });
    });

    it('shows OTP expiry countdown', async () => {
      await goToOtpStep();
      // OTP expiry is set to 300 seconds (5:00)
      expect(screen.getByText(/expires in/i)).toBeInTheDocument();
    });

    it('verifies OTP successfully and transitions to newPassword step', async () => {
      await goToOtpStep();
      const otpInput = screen.getByLabelText(/verification code/i);
      fireEvent.change(otpInput, { target: { value: '123456' } });
      fireEvent.click(screen.getByText('Verify OTP'));
      await waitFor(() => {
        expect(mockVerifyOtp).toHaveBeenCalledWith('123456');
      });
      await waitFor(() => {
        expect(screen.getByText(/Phone verified/i)).toBeInTheDocument();
      });
    });

    it('shows loading state while verifying OTP', async () => {
      await goToOtpStep();
      mockVerifyOtp.mockReturnValueOnce(new Promise(() => {})); // hang
      const otpInput = screen.getByLabelText(/verification code/i);
      fireEvent.change(otpInput, { target: { value: '123456' } });
      fireEvent.click(screen.getByText('Verify OTP'));
      await waitFor(() => {
        expect(screen.getByText('Verifying...')).toBeInTheDocument();
      });
    });

    it('shows error on OTP verification failure', async () => {
      await goToOtpStep();
      mockVerifyOtp.mockRejectedValueOnce(new Error('Invalid OTP code'));
      const otpInput = screen.getByLabelText(/verification code/i);
      fireEvent.change(otpInput, { target: { value: '000000' } });
      fireEvent.click(screen.getByText('Verify OTP'));
      await waitFor(() => {
        expect(screen.getByText('Invalid OTP code')).toBeInTheDocument();
      });
    });

    it('shows phone number on OTP step subtitle', async () => {
      await goToOtpStep('9876543210');
      expect(screen.getByText(/9876543210/)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // OTP CHANNEL: NEW PASSWORD
  // =========================================================================
  describe('OTP Channel — New Password', () => {
    it('shows new password and confirm password fields', async () => {
      await goToNewPasswordStep();
      expect(document.getElementById('otpreset-new-password')).toBeInTheDocument();
      expect(document.getElementById('otpreset-confirm-password')).toBeInTheDocument();
    });

    it('shows password checklist', async () => {
      await goToNewPasswordStep();
      expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
      expect(screen.getByText(/one uppercase letter/i)).toBeInTheDocument();
      expect(screen.getByText(/one lowercase letter/i)).toBeInTheDocument();
      expect(screen.getByText(/one digit/i)).toBeInTheDocument();
    });

    it('validates password too short', async () => {
      await goToNewPasswordStep();
      const pwInput = document.getElementById('otpreset-new-password')!;
      const confirmInput = document.getElementById('otpreset-confirm-password')!;
      fireEvent.change(pwInput, { target: { value: 'Short1' } });
      fireEvent.change(confirmInput, { target: { value: 'Short1' } });
      const form = document.querySelector('form') as HTMLFormElement;
      fireEvent.submit(form);
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/at least 8 characters/i);
      });
    });

    it('validates password missing uppercase', async () => {
      await goToNewPasswordStep();
      const pwInput = document.getElementById('otpreset-new-password')!;
      const confirmInput = document.getElementById('otpreset-confirm-password')!;
      fireEvent.change(pwInput, { target: { value: 'lowercase1abc' } });
      fireEvent.change(confirmInput, { target: { value: 'lowercase1abc' } });
      const form = document.querySelector('form') as HTMLFormElement;
      fireEvent.submit(form);
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/uppercase letter/i);
      });
    });

    it('validates password missing lowercase', async () => {
      await goToNewPasswordStep();
      const pwInput = document.getElementById('otpreset-new-password')!;
      const confirmInput = document.getElementById('otpreset-confirm-password')!;
      fireEvent.change(pwInput, { target: { value: 'UPPERCASE1ABC' } });
      fireEvent.change(confirmInput, { target: { value: 'UPPERCASE1ABC' } });
      const form = document.querySelector('form') as HTMLFormElement;
      fireEvent.submit(form);
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/lowercase letter/i);
      });
    });

    it('validates password missing digit', async () => {
      await goToNewPasswordStep();
      const pwInput = document.getElementById('otpreset-new-password')!;
      const confirmInput = document.getElementById('otpreset-confirm-password')!;
      fireEvent.change(pwInput, { target: { value: 'NoDigitHere' } });
      fireEvent.change(confirmInput, { target: { value: 'NoDigitHere' } });
      const form = document.querySelector('form') as HTMLFormElement;
      fireEvent.submit(form);
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/one digit/i);
      });
    });

    it('validates passwords do not match', async () => {
      await goToNewPasswordStep();
      const pwInput = document.getElementById('otpreset-new-password')!;
      const confirmInput = document.getElementById('otpreset-confirm-password')!;
      fireEvent.change(pwInput, { target: { value: 'ValidPass1' } });
      fireEvent.change(confirmInput, { target: { value: 'Different1' } });
      const form = document.querySelector('form') as HTMLFormElement;
      fireEvent.submit(form);
      await waitFor(() => {
        expect(screen.getByText(/do not match/i)).toBeInTheDocument();
      });
    });

    it('resets password successfully via OTP channel', async () => {
      await goToNewPasswordStep();
      mockFetchSuccess({ message: 'Password reset successful' });
      const pwInput = document.getElementById('otpreset-new-password')!;
      const confirmInput = document.getElementById('otpreset-confirm-password')!;
      fireEvent.change(pwInput, { target: { value: 'NewValid1pass' } });
      fireEvent.change(confirmInput, { target: { value: 'NewValid1pass' } });
      const form = document.querySelector('form') as HTMLFormElement;
      fireEvent.submit(form);
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/forgot-password/reset'),
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('newPassword'),
          })
        );
      });
      await waitFor(() => {
        expect(screen.getByText(/Password Reset Successful/i)).toBeInTheDocument();
      });
    });

    it('shows Sign In link on success step', async () => {
      await goToNewPasswordStep();
      mockFetchSuccess();
      const pwInput = document.getElementById('otpreset-new-password')!;
      const confirmInput = document.getElementById('otpreset-confirm-password')!;
      fireEvent.change(pwInput, { target: { value: 'NewValid1pass' } });
      fireEvent.change(confirmInput, { target: { value: 'NewValid1pass' } });
      const form = document.querySelector('form') as HTMLFormElement;
      fireEvent.submit(form);
      await waitFor(() => {
        expect(screen.getByText('Sign In')).toBeInTheDocument();
      });
    });

    it('shows error on password reset API failure', async () => {
      await goToNewPasswordStep();
      mockFetchError('Token expired');
      const pwInput = document.getElementById('otpreset-new-password')!;
      const confirmInput = document.getElementById('otpreset-confirm-password')!;
      fireEvent.change(pwInput, { target: { value: 'NewValid1pass' } });
      fireEvent.change(confirmInput, { target: { value: 'NewValid1pass' } });
      const form = document.querySelector('form') as HTMLFormElement;
      fireEvent.submit(form);
      await waitFor(() => {
        expect(screen.getByText('Token expired')).toBeInTheDocument();
      });
    });

    it('shows loading state while resetting password', async () => {
      await goToNewPasswordStep();
      (global.fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(new Promise(() => {}));
      const pwInput = document.getElementById('otpreset-new-password')!;
      const confirmInput = document.getElementById('otpreset-confirm-password')!;
      fireEvent.change(pwInput, { target: { value: 'NewValid1pass' } });
      fireEvent.change(confirmInput, { target: { value: 'NewValid1pass' } });
      const form = document.querySelector('form') as HTMLFormElement;
      fireEvent.submit(form);
      await waitFor(() => {
        expect(screen.getByText('Resetting...')).toBeInTheDocument();
      });
    });

    it('shows show/hide toggle for new password field', async () => {
      await goToNewPasswordStep();
      const toggleBtn = screen.getByLabelText(/show new password/i);
      expect(toggleBtn).toBeInTheDocument();
      fireEvent.click(toggleBtn);
      expect(screen.getByLabelText(/hide new password/i)).toBeInTheDocument();
    });

    it('shows show/hide toggle for confirm password field', async () => {
      await goToNewPasswordStep();
      const toggleBtn = screen.getByLabelText(/show confirm password/i);
      expect(toggleBtn).toBeInTheDocument();
      fireEvent.click(toggleBtn);
      expect(screen.getByLabelText(/hide confirm password/i)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // EMAIL CHANNEL: EMAIL ENTRY
  // =========================================================================
  describe('Email Channel — Email Entry', () => {
    it('shows email input with label', () => {
      goToEmailStep();
      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    });

    it('shows "Use a different method" link', () => {
      goToEmailStep();
      expect(screen.getByText(/Use a different method/i)).toBeInTheDocument();
    });

    it('navigates back to choose step on "Use a different method"', () => {
      goToEmailStep();
      fireEvent.click(screen.getByText(/Use a different method/i));
      expect(screen.getByText(/Choose how you want to reset your password/)).toBeInTheDocument();
    });

    it('validates empty email', async () => {
      goToEmailStep();
      fireEvent.click(screen.getByText('Send Reset Link'));
      await waitFor(() => {
        expect(screen.getByText(/enter your email/i)).toBeInTheDocument();
      });
    });

    it('validates invalid email format', async () => {
      goToEmailStep();
      const emailInput = screen.getByLabelText(/email address/i);
      fireEvent.change(emailInput, { target: { value: 'notanemail' } });
      const form = document.querySelector('form') as HTMLFormElement;
      fireEvent.submit(form);
      await waitFor(() => {
        expect(screen.getByText(/valid email address/i)).toBeInTheDocument();
      });
    });

    it('shows loading state while sending email request', async () => {
      goToEmailStep();
      (global.fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(new Promise(() => {}));
      const emailInput = screen.getByLabelText(/email address/i);
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.click(screen.getByText('Send Reset Link'));
      await waitFor(() => {
        expect(screen.getByText('Sending...')).toBeInTheDocument();
      });
    });

    it('always transitions to emailSent even on API error (anti-enumeration)', async () => {
      goToEmailStep();
      // Simulate network error — should still show emailSent (anti-enumeration)
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'));
      const emailInput = screen.getByLabelText(/email address/i);
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.click(screen.getByText('Send Reset Link'));
      await waitFor(() => {
        expect(screen.getByText(/Check Your Email/i)).toBeInTheDocument();
      });
    });

    it('transitions to emailSent on successful request', async () => {
      await goToEmailSentStep();
      expect(screen.getByText(/If an account exists/i)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // EMAIL CHANNEL: EMAIL SENT
  // =========================================================================
  describe('Email Channel — Email Sent', () => {
    it('shows anti-enumeration message with email', async () => {
      await goToEmailSentStep('user@test.com');
      expect(screen.getByText(/user@test.com/)).toBeInTheDocument();
      expect(screen.getByText(/If an account exists/i)).toBeInTheDocument();
    });

    it('shows "I Have a Reset Token" button', async () => {
      await goToEmailSentStep();
      expect(screen.getByText('I Have a Reset Token')).toBeInTheDocument();
    });

    it('navigates to email reset step on "I Have a Reset Token"', async () => {
      await goToEmailSentStep();
      fireEvent.click(screen.getByText('I Have a Reset Token'));
      await waitFor(() => {
        expect(screen.getByLabelText(/reset token/i)).toBeInTheDocument();
      });
    });

    it('shows "Try a different email" link', async () => {
      await goToEmailSentStep();
      expect(screen.getByText(/Try a different email/i)).toBeInTheDocument();
    });

    it('navigates back to email entry on "Try a different email"', async () => {
      await goToEmailSentStep();
      fireEvent.click(screen.getByText(/Try a different email/i));
      await waitFor(() => {
        expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
        expect(screen.getByText('Send Reset Link')).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // EMAIL CHANNEL: EMAIL RESET (Token + New Password)
  // =========================================================================
  describe('Email Channel — Email Reset', () => {
    it('shows email, token, new password, and confirm password fields', async () => {
      await goToEmailResetStep();
      expect(document.getElementById('emailreset-token')).toBeInTheDocument();
      expect(document.getElementById('emailreset-new-password')).toBeInTheDocument();
      expect(document.getElementById('emailreset-confirm-password')).toBeInTheDocument();
    });

    it('shows password checklist on email reset step', async () => {
      await goToEmailResetStep();
      expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
    });

    it('validates empty reset token', async () => {
      await goToEmailResetStep();
      const pwInput = document.getElementById('emailreset-new-password')!;
      const confirmInput = document.getElementById('emailreset-confirm-password')!;
      fireEvent.change(pwInput, { target: { value: 'ValidPass1' } });
      fireEvent.change(confirmInput, { target: { value: 'ValidPass1' } });
      const form = document.querySelector('form') as HTMLFormElement;
      fireEvent.submit(form);
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/enter the reset token/i);
      });
    });

    it('validates password too short on email reset', async () => {
      await goToEmailResetStep();
      const tokenInput = document.getElementById('emailreset-token')!;
      const pwInput = document.getElementById('emailreset-new-password')!;
      const confirmInput = document.getElementById('emailreset-confirm-password')!;
      fireEvent.change(tokenInput, { target: { value: 'valid-token' } });
      fireEvent.change(pwInput, { target: { value: 'Sh1' } });
      fireEvent.change(confirmInput, { target: { value: 'Sh1' } });
      const form = document.querySelector('form') as HTMLFormElement;
      fireEvent.submit(form);
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('validates passwords do not match on email reset', async () => {
      await goToEmailResetStep();
      const tokenInput = document.getElementById('emailreset-token')!;
      const pwInput = document.getElementById('emailreset-new-password')!;
      const confirmInput = document.getElementById('emailreset-confirm-password')!;
      fireEvent.change(tokenInput, { target: { value: 'valid-token' } });
      fireEvent.change(pwInput, { target: { value: 'ValidPass1' } });
      fireEvent.change(confirmInput, { target: { value: 'Different1' } });
      const form = document.querySelector('form') as HTMLFormElement;
      fireEvent.submit(form);
      await waitFor(() => {
        expect(screen.getByText(/do not match/i)).toBeInTheDocument();
      });
    });

    it('resets password successfully via email channel', async () => {
      await goToEmailResetStep('user@test.com');
      mockFetchSuccess({ message: 'Password reset successful' });
      const tokenInput = document.getElementById('emailreset-token')!;
      const pwInput = document.getElementById('emailreset-new-password')!;
      const confirmInput = document.getElementById('emailreset-confirm-password')!;
      fireEvent.change(tokenInput, { target: { value: 'valid-token-123' } });
      fireEvent.change(pwInput, { target: { value: 'NewValid1pass' } });
      fireEvent.change(confirmInput, { target: { value: 'NewValid1pass' } });
      const form = document.querySelector('form') as HTMLFormElement;
      fireEvent.submit(form);
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/forgot-password/email-reset'),
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('valid-token-123'),
          })
        );
      });
      await waitFor(() => {
        expect(screen.getByText(/Password Reset Successful/i)).toBeInTheDocument();
      });
    });

    it('shows error on email reset API failure', async () => {
      await goToEmailResetStep();
      mockFetchError('Invalid or expired token');
      const tokenInput = document.getElementById('emailreset-token')!;
      const pwInput = document.getElementById('emailreset-new-password')!;
      const confirmInput = document.getElementById('emailreset-confirm-password')!;
      fireEvent.change(tokenInput, { target: { value: 'expired-token' } });
      fireEvent.change(pwInput, { target: { value: 'NewValid1pass' } });
      fireEvent.change(confirmInput, { target: { value: 'NewValid1pass' } });
      const form = document.querySelector('form') as HTMLFormElement;
      fireEvent.submit(form);
      await waitFor(() => {
        expect(screen.getByText('Invalid or expired token')).toBeInTheDocument();
      });
    });

    it('shows loading state while resetting via email channel', async () => {
      await goToEmailResetStep();
      (global.fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(new Promise(() => {}));
      const tokenInput = document.getElementById('emailreset-token')!;
      const pwInput = document.getElementById('emailreset-new-password')!;
      const confirmInput = document.getElementById('emailreset-confirm-password')!;
      fireEvent.change(tokenInput, { target: { value: 'valid-token' } });
      fireEvent.change(pwInput, { target: { value: 'NewValid1pass' } });
      fireEvent.change(confirmInput, { target: { value: 'NewValid1pass' } });
      const form = document.querySelector('form') as HTMLFormElement;
      fireEvent.submit(form);
      await waitFor(() => {
        expect(screen.getByText('Resetting...')).toBeInTheDocument();
      });
    });

    it('shows show/hide toggle for password fields on email reset', async () => {
      await goToEmailResetStep();
      const showNewBtn = screen.getByLabelText(/show new password/i);
      expect(showNewBtn).toBeInTheDocument();
      const showConfirmBtn = screen.getByLabelText(/show confirm password/i);
      expect(showConfirmBtn).toBeInTheDocument();
    });
  });
});
