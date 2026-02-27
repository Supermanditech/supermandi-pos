import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ForgotPasswordPage from '../../../app/(auth)/forgot-password/page';

// Mock next/link
jest.mock('next/link', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ href, children, ...props }: any) =>
      React.createElement('a', { href, ...props }, children),
  };
});

// Mock firebase
jest.mock('../../../lib/firebase', () => ({
  setupRecaptcha: jest.fn(),
  sendOtp: jest.fn(),
  verifyOtp: jest.fn(),
  isFirebaseReady: jest.fn().mockReturnValue(true),
  cleanup: jest.fn(),
}));

// Mock API
const mockApiFetch = jest.fn();
jest.mock('../../../lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders channel selector on initial load', () => {
    render(<ForgotPasswordPage />);
    expect(screen.getByText('Reset Password')).toBeInTheDocument();
    expect(screen.getByText(/Choose how you want to reset your password/)).toBeInTheDocument();
    expect(screen.getByText('Reset via mobile OTP')).toBeInTheDocument();
    expect(screen.getByText('Reset via email link')).toBeInTheDocument();
  });

  it('renders Sign In link on channel selector', () => {
    render(<ForgotPasswordPage />);
    const signInLink = screen.getByText('Sign In');
    expect(signInLink).toBeInTheDocument();
    expect(signInLink.closest('a')).toHaveAttribute('href', '/login');
  });

  it('navigates to OTP channel and shows phone input', () => {
    render(<ForgotPasswordPage />);
    fireEvent.click(screen.getByText('Reset via mobile OTP'));
    expect(screen.getByText(/Enter your registered phone number/)).toBeInTheDocument();
    expect(screen.getByLabelText('Phone Number')).toBeInTheDocument();
    expect(screen.getByText('Send OTP')).toBeInTheDocument();
  });

  it('validates invalid phone on OTP channel', async () => {
    render(<ForgotPasswordPage />);
    fireEvent.click(screen.getByText('Reset via mobile OTP'));
    const phoneInput = screen.getByLabelText('Phone Number');
    fireEvent.change(phoneInput, { target: { value: '123' } });
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() => {
      expect(screen.getByText(/valid phone number/)).toBeInTheDocument();
    });
  });

  it('navigates to email channel and shows email input', () => {
    render(<ForgotPasswordPage />);
    fireEvent.click(screen.getByText('Reset via email link'));
    expect(screen.getByText(/Enter your registered email address/)).toBeInTheDocument();
    expect(screen.getByLabelText('Email Address')).toBeInTheDocument();
    expect(screen.getByText('Send Reset Link')).toBeInTheDocument();
  });

  it('validates empty email on email channel', async () => {
    render(<ForgotPasswordPage />);
    fireEvent.click(screen.getByText('Reset via email link'));
    fireEvent.click(screen.getByText('Send Reset Link'));
    await waitFor(() => {
      expect(screen.getByText('Please enter your email address')).toBeInTheDocument();
    });
  });

  it('validates invalid email format on email channel', async () => {
    render(<ForgotPasswordPage />);
    fireEvent.click(screen.getByText('Reset via email link'));
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'invalid' } });
    const form = screen.getByText('Send Reset Link').closest('form')!;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
    });
  });

  it('shows Check Your Email step on successful email submit', async () => {
    mockApiFetch.mockResolvedValueOnce({ success: true, message: 'Sent' });
    render(<ForgotPasswordPage />);
    fireEvent.click(screen.getByText('Reset via email link'));
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'test@test.com' } });
    fireEvent.click(screen.getByText('Send Reset Link'));
    await waitFor(() => {
      expect(screen.getByText('Check Your Email')).toBeInTheDocument();
    });
  });

  it('shows Check Your Email even on API error (prevents email enumeration)', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('Not found'));
    render(<ForgotPasswordPage />);
    fireEvent.click(screen.getByText('Reset via email link'));
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'test@test.com' } });
    fireEvent.click(screen.getByText('Send Reset Link'));
    await waitFor(() => {
      expect(screen.getByText('Check Your Email')).toBeInTheDocument();
    });
  });

  it('renders Try a different email button in sent step', async () => {
    mockApiFetch.mockResolvedValueOnce({ success: true });
    render(<ForgotPasswordPage />);
    fireEvent.click(screen.getByText('Reset via email link'));
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'test@test.com' } });
    fireEvent.click(screen.getByText('Send Reset Link'));
    await waitFor(() => {
      expect(screen.getByText('Try a different email')).toBeInTheDocument();
    });
  });

  it('renders I Have a Reset Token button in sent step', async () => {
    mockApiFetch.mockResolvedValueOnce({ success: true });
    render(<ForgotPasswordPage />);
    fireEvent.click(screen.getByText('Reset via email link'));
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'test@test.com' } });
    fireEvent.click(screen.getByText('Send Reset Link'));
    await waitFor(() => {
      // R7.SUP.004: Changed from Link to button that navigates to emailReset step
      const tokenBtn = screen.getByText('I Have a Reset Token');
      expect(tokenBtn.tagName).toBe('BUTTON');
    });
  });

  it('shows Use a different method link on email channel', () => {
    render(<ForgotPasswordPage />);
    fireEvent.click(screen.getByText('Reset via email link'));
    expect(screen.getByText('Use a different method')).toBeInTheDocument();
  });

  it('shows Register link on email channel', () => {
    render(<ForgotPasswordPage />);
    fireEvent.click(screen.getByText('Reset via email link'));
    const registerLink = screen.getByText('Register');
    expect(registerLink.closest('a')).toHaveAttribute('href', '/register');
  });
});
