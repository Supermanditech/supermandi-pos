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

// Mock API
const mockApiFetch = jest.fn();
jest.mock('../../../lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the Reset Password heading', () => {
    render(<ForgotPasswordPage />);
    expect(screen.getByText('Reset Password')).toBeInTheDocument();
  });

  it('renders the email input field', () => {
    render(<ForgotPasswordPage />);
    expect(screen.getByLabelText('Email Address')).toBeInTheDocument();
  });

  it('renders Send Reset Link button', () => {
    render(<ForgotPasswordPage />);
    expect(screen.getByText('Send Reset Link')).toBeInTheDocument();
  });

  it('renders Sign In link', () => {
    render(<ForgotPasswordPage />);
    const signInLink = screen.getByText('Sign In');
    expect(signInLink).toBeInTheDocument();
    expect(signInLink.closest('a')).toHaveAttribute('href', '/login');
  });

  it('renders Register link', () => {
    render(<ForgotPasswordPage />);
    const registerLink = screen.getByText('Register');
    expect(registerLink).toBeInTheDocument();
    expect(registerLink.closest('a')).toHaveAttribute('href', '/register');
  });

  it('validates empty email on submit', async () => {
    render(<ForgotPasswordPage />);
    fireEvent.click(screen.getByText('Send Reset Link'));
    await waitFor(() => {
      expect(screen.getByText('Please enter your email address')).toBeInTheDocument();
    });
  });

  it('validates invalid email format', async () => {
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'invalid' } });
    // Use fireEvent.submit on the form directly to bypass HTML5 constraint validation
    // which prevents submission when type="email" has an invalid value
    const form = screen.getByText('Send Reset Link').closest('form')!;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
    });
  });

  it('shows Check Your Email step on successful submit', async () => {
    mockApiFetch.mockResolvedValueOnce({ success: true, message: 'Sent' });
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'test@test.com' } });
    fireEvent.click(screen.getByText('Send Reset Link'));
    await waitFor(() => {
      expect(screen.getByText('Check Your Email')).toBeInTheDocument();
    });
  });

  it('shows Check Your Email step even on API error (prevents email enumeration)', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('Not found'));
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'test@test.com' } });
    fireEvent.click(screen.getByText('Send Reset Link'));
    await waitFor(() => {
      expect(screen.getByText('Check Your Email')).toBeInTheDocument();
    });
  });

  it('renders Try a different email button in sent step', async () => {
    mockApiFetch.mockResolvedValueOnce({ success: true });
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'test@test.com' } });
    fireEvent.click(screen.getByText('Send Reset Link'));
    await waitFor(() => {
      expect(screen.getByText('Try a different email')).toBeInTheDocument();
    });
  });

  it('returns to email step when clicking Try a different email', async () => {
    mockApiFetch.mockResolvedValueOnce({ success: true });
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'test@test.com' } });
    fireEvent.click(screen.getByText('Send Reset Link'));
    await waitFor(() => {
      expect(screen.getByText('Try a different email')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Try a different email'));
    expect(screen.getByText('Reset Password')).toBeInTheDocument();
  });

  it('renders I Have a Reset Token link in sent step', async () => {
    mockApiFetch.mockResolvedValueOnce({ success: true });
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'test@test.com' } });
    fireEvent.click(screen.getByText('Send Reset Link'));
    await waitFor(() => {
      const tokenLink = screen.getByText('I Have a Reset Token');
      expect(tokenLink.closest('a')).toHaveAttribute('href', '/reset-password');
    });
  });
});
