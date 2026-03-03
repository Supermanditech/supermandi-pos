import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ResetPasswordPage from '../../../app/(auth)/reset-password/page';

// Mock next/navigation — provide email+token so component renders form (not missing-params view)
const mockSearchParams = new URLSearchParams({ email: 'test@test.com', token: 'abc123' });
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => '/reset-password',
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

// Mock API
const mockApiFetch = jest.fn();
jest.mock('../../../lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the Set New Password heading', () => {
    render(<ResetPasswordPage />);
    expect(screen.getByText('Set New Password')).toBeInTheDocument();
  });

  it('renders all form fields', () => {
    render(<ResetPasswordPage />);
    expect(screen.getByLabelText('Email Address')).toBeInTheDocument();
    expect(screen.getByLabelText('Reset Token')).toBeInTheDocument();
    expect(screen.getByLabelText('New Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
  });

  it('renders Reset Password button', () => {
    render(<ResetPasswordPage />);
    expect(screen.getByText('Reset Password')).toBeInTheDocument();
  });

  it('validates empty email', async () => {
    render(<ResetPasswordPage />);
    // Clear the pre-filled email from search params
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: '' } });
    fireEvent.click(screen.getByText('Reset Password'));
    await waitFor(() => {
      expect(screen.getByText('Please enter your email address')).toBeInTheDocument();
    });
  });

  it('validates empty token', async () => {
    render(<ResetPasswordPage />);
    // Clear the pre-filled token from search params
    fireEvent.change(screen.getByLabelText('Reset Token'), { target: { value: '' } });
    fireEvent.click(screen.getByText('Reset Password'));
    await waitFor(() => {
      expect(screen.getByText('Please enter the reset token from your email')).toBeInTheDocument();
    });
  });

  it('validates short password', async () => {
    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'short' } });
    fireEvent.click(screen.getByText('Reset Password'));
    await waitFor(() => {
      expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    });
  });

  it('validates password mismatch', async () => {
    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'Password123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'Password456' } });
    fireEvent.click(screen.getByText('Reset Password'));
    await waitFor(() => {
      // Multiple elements show this message (form-level alert + inline validation)
      const matches = screen.getAllByText('Passwords do not match');
      expect(matches.length).toBeGreaterThan(0);
    });
  });

  it('shows success step on successful reset', async () => {
    mockApiFetch.mockResolvedValueOnce({ success: true, message: 'Password reset' });
    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'NewPassword123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'NewPassword123' } });
    fireEvent.click(screen.getByText('Reset Password'));
    await waitFor(() => {
      expect(screen.getByText('Password Reset Successful')).toBeInTheDocument();
    });
  });

  it('shows error message on API failure', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('Token expired'));
    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'NewPassword123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'NewPassword123' } });
    fireEvent.click(screen.getByText('Reset Password'));
    await waitFor(() => {
      expect(screen.getByText('Token expired')).toBeInTheDocument();
    });
  });

  it('renders Request Reset link', () => {
    render(<ResetPasswordPage />);
    const requestLink = screen.getByText('Request Reset');
    expect(requestLink.closest('a')).toHaveAttribute('href', '/forgot-password');
  });

  it('renders Sign In link', () => {
    render(<ResetPasswordPage />);
    const signInLink = screen.getByText('Sign In');
    expect(signInLink.closest('a')).toHaveAttribute('href', '/login');
  });
});
