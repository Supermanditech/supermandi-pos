// SuperAdmin — Test LoginGate component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginGate } from '../../components/LoginGate';
import * as authToken from '../../api/authToken';

vi.mock('../../api/authToken', () => ({
  sendAdminOtp: vi.fn(),
  verifyAdminOtp: vi.fn(),
}));

describe('LoginGate', () => {
  const onLogin = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Basic rendering
  // =========================================================================

  describe('basic rendering', () => {
    it('renders login header', () => {
      render(<LoginGate onLogin={onLogin} />);
      expect(screen.getByText('SuperAdmin Login')).toBeTruthy();
    });

    it('renders brand text', () => {
      render(<LoginGate onLogin={onLogin} />);
      expect(screen.getByText('SuperMandi')).toBeTruthy();
      // 'SuperAdmin' appears in both the brand area and the login header
      const superAdminElements = screen.getAllByText('SuperAdmin');
      expect(superAdminElements.length).toBeGreaterThanOrEqual(1);
    });

    it('renders email input field', () => {
      render(<LoginGate onLogin={onLogin} />);
      expect(screen.getByPlaceholderText('admin@supermandi.tech')).toBeTruthy();
    });

    it('renders send OTP button', () => {
      render(<LoginGate onLogin={onLogin} />);
      expect(screen.getByText('Send OTP')).toBeTruthy();
    });

    it('renders info text about authorised emails', () => {
      render(<LoginGate onLogin={onLogin} />);
      expect(screen.getByText(/authorised admin emails/)).toBeTruthy();
    });

    it('renders footer', () => {
      render(<LoginGate onLogin={onLogin} />);
      expect(screen.getByText(/SuperMandi Tech/)).toBeTruthy();
    });

    it('disables send OTP button when email is empty', () => {
      render(<LoginGate onLogin={onLogin} />);
      const button = screen.getByText('Send OTP');
      expect(button).toBeDisabled();
    });
  });

  // =========================================================================
  // Email validation
  // =========================================================================

  describe('email validation', () => {
    it('shows error for email without @ symbol', async () => {
      render(<LoginGate onLogin={onLogin} />);
      const emailInput = screen.getByPlaceholderText('admin@supermandi.tech');
      fireEvent.change(emailInput, { target: { value: 'invalidemail' } });

      // Submit the form
      const form = emailInput.closest('form')!;
      fireEvent.submit(form);

      expect(screen.getByText('Enter a valid email address')).toBeTruthy();
    });

    it('shows error for empty email', async () => {
      render(<LoginGate onLogin={onLogin} />);
      const emailInput = screen.getByPlaceholderText('admin@supermandi.tech');
      fireEvent.change(emailInput, { target: { value: '   ' } });

      const form = emailInput.closest('form')!;
      fireEvent.submit(form);

      expect(screen.getByText('Enter a valid email address')).toBeTruthy();
    });
  });

  // =========================================================================
  // Send OTP
  // =========================================================================

  describe('send OTP', () => {
    it('calls sendAdminOtp with trimmed lowercase email', async () => {
      (authToken.sendAdminOtp as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

      render(<LoginGate onLogin={onLogin} />);
      const emailInput = screen.getByPlaceholderText('admin@supermandi.tech');
      fireEvent.change(emailInput, { target: { value: '  Admin@Test.COM  ' } });

      const form = emailInput.closest('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(authToken.sendAdminOtp).toHaveBeenCalledWith('admin@test.com');
      });
    });

    it('shows loading state during OTP send', async () => {
      let resolveOtp: (v: any) => void;
      const otpPromise = new Promise((resolve) => { resolveOtp = resolve; });
      (authToken.sendAdminOtp as ReturnType<typeof vi.fn>).mockReturnValue(otpPromise);

      render(<LoginGate onLogin={onLogin} />);
      const emailInput = screen.getByPlaceholderText('admin@supermandi.tech');
      fireEvent.change(emailInput, { target: { value: 'admin@test.com' } });

      const form = emailInput.closest('form')!;
      fireEvent.submit(form);

      expect(screen.getByText('Sending OTP...')).toBeTruthy();

      resolveOtp!({ success: true });
      await waitFor(() => {
        expect(screen.queryByText('Sending OTP...')).toBeNull();
      });
    });

    it('transitions to OTP step on success', async () => {
      (authToken.sendAdminOtp as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

      render(<LoginGate onLogin={onLogin} />);
      const emailInput = screen.getByPlaceholderText('admin@supermandi.tech');
      fireEvent.change(emailInput, { target: { value: 'admin@test.com' } });

      const form = emailInput.closest('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText(/OTP sent to/)).toBeTruthy();
        expect(screen.getByPlaceholderText('Enter 6-digit code')).toBeTruthy();
      });
    });

    it('shows error message on send failure', async () => {
      (authToken.sendAdminOtp as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Rate limited'));

      render(<LoginGate onLogin={onLogin} />);
      const emailInput = screen.getByPlaceholderText('admin@supermandi.tech');
      fireEvent.change(emailInput, { target: { value: 'admin@test.com' } });

      const form = emailInput.closest('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText('Rate limited')).toBeTruthy();
      });
    });

    it('shows default error for non-Error thrown values', async () => {
      (authToken.sendAdminOtp as ReturnType<typeof vi.fn>).mockRejectedValue('string error');

      render(<LoginGate onLogin={onLogin} />);
      const emailInput = screen.getByPlaceholderText('admin@supermandi.tech');
      fireEvent.change(emailInput, { target: { value: 'admin@test.com' } });

      const form = emailInput.closest('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText(/Failed to send OTP/)).toBeTruthy();
      });
    });
  });

  // =========================================================================
  // Verify OTP
  // =========================================================================

  describe('verify OTP', () => {
    beforeEach(async () => {
      (authToken.sendAdminOtp as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

      render(<LoginGate onLogin={onLogin} />);
      const emailInput = screen.getByPlaceholderText('admin@supermandi.tech');
      fireEvent.change(emailInput, { target: { value: 'admin@test.com' } });

      const form = emailInput.closest('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter 6-digit code')).toBeTruthy();
      });
    });

    it('shows OTP sent confirmation', () => {
      expect(screen.getByText(/OTP sent to/)).toBeTruthy();
      expect(screen.getByText('admin@test.com')).toBeTruthy();
    });

    it('shows verify OTP button', () => {
      expect(screen.getByText('Verify OTP')).toBeTruthy();
    });

    it('shows error for short OTP', async () => {
      const otpInput = screen.getByPlaceholderText('Enter 6-digit code');
      fireEvent.change(otpInput, { target: { value: '12' } });

      const form = otpInput.closest('form')!;
      fireEvent.submit(form);

      expect(screen.getByText('Enter the 6-digit OTP from your email')).toBeTruthy();
    });

    it('calls verifyAdminOtp on submit', async () => {
      (authToken.verifyAdminOtp as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        token: 'jwt-token',
      });

      const otpInput = screen.getByPlaceholderText('Enter 6-digit code');
      fireEvent.change(otpInput, { target: { value: '123456' } });

      const form = otpInput.closest('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(authToken.verifyAdminOtp).toHaveBeenCalledWith('admin@test.com', '123456');
      });
    });

    it('calls onLogin on successful verification', async () => {
      (authToken.verifyAdminOtp as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        token: 'jwt-token',
      });

      const otpInput = screen.getByPlaceholderText('Enter 6-digit code');
      fireEvent.change(otpInput, { target: { value: '123456' } });

      const form = otpInput.closest('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(onLogin).toHaveBeenCalled();
      });
    });

    it('shows error on invalid OTP', async () => {
      (authToken.verifyAdminOtp as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Invalid OTP code'));

      const otpInput = screen.getByPlaceholderText('Enter 6-digit code');
      fireEvent.change(otpInput, { target: { value: '000000' } });

      const form = otpInput.closest('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText('Invalid OTP code')).toBeTruthy();
      });
    });

    it('shows loading state during verification', async () => {
      let resolveVerify: (v: any) => void;
      const verifyPromise = new Promise((resolve) => { resolveVerify = resolve; });
      (authToken.verifyAdminOtp as ReturnType<typeof vi.fn>).mockReturnValue(verifyPromise);

      const otpInput = screen.getByPlaceholderText('Enter 6-digit code');
      fireEvent.change(otpInput, { target: { value: '123456' } });

      const form = otpInput.closest('form')!;
      fireEvent.submit(form);

      expect(screen.getByText('Verifying...')).toBeTruthy();

      resolveVerify!({ success: true, token: 'tok' });
      await waitFor(() => {
        expect(onLogin).toHaveBeenCalled();
      });
    });

    it('only allows numeric OTP input', () => {
      const otpInput = screen.getByPlaceholderText('Enter 6-digit code') as HTMLInputElement;
      fireEvent.change(otpInput, { target: { value: 'abc123def' } });
      // The component strips non-numeric chars
      expect(otpInput.value).toBe('123');
    });
  });

  // =========================================================================
  // Navigation
  // =========================================================================

  describe('navigation', () => {
    it('shows change email button in OTP step', async () => {
      (authToken.sendAdminOtp as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

      render(<LoginGate onLogin={onLogin} />);
      const emailInput = screen.getByPlaceholderText('admin@supermandi.tech');
      fireEvent.change(emailInput, { target: { value: 'admin@test.com' } });

      const form = emailInput.closest('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText(/Change email/)).toBeTruthy();
      });
    });

    it('goes back to email step on change email click', async () => {
      (authToken.sendAdminOtp as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

      render(<LoginGate onLogin={onLogin} />);
      const emailInput = screen.getByPlaceholderText('admin@supermandi.tech');
      fireEvent.change(emailInput, { target: { value: 'admin@test.com' } });

      const form = emailInput.closest('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText(/Change email/)).toBeTruthy();
      });

      fireEvent.click(screen.getByText(/Change email/));
      expect(screen.getByPlaceholderText('admin@supermandi.tech')).toBeTruthy();
    });

    it('shows resend OTP button with countdown', async () => {
      (authToken.sendAdminOtp as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

      render(<LoginGate onLogin={onLogin} />);
      const emailInput = screen.getByPlaceholderText('admin@supermandi.tech');
      fireEvent.change(emailInput, { target: { value: 'admin@test.com' } });

      const form = emailInput.closest('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText(/Resend in/)).toBeTruthy();
      });
    });
  });
});
