import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ForgotPasswordPage from '../pages/ForgotPasswordPage';

vi.mock('../lib/firebase', () => ({
  setupRecaptcha: vi.fn(),
  sendOtp: vi.fn().mockResolvedValue(true),
  verifyOtp: vi.fn().mockResolvedValue('mock-id-token'),
  isFirebaseReady: vi.fn().mockReturnValue(true),
  cleanup: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  API_GATEWAY_BASE: 'http://localhost:3000',
  safeJson: (res: { json: () => Promise<unknown> }) => res.json(),
}));

vi.mock('../components/BuildStamp', () => ({
  BuildStamp: () => <span data-testid="build-stamp">v1.0</span>,
}));

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('renders channel selector on initial load', () => {
    render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);
    expect(screen.getByText('Reset Password')).toBeInTheDocument();
    expect(screen.getByText(/Choose how you want to reset your password/)).toBeInTheDocument();
    expect(screen.getByText('Reset via mobile OTP')).toBeInTheDocument();
    expect(screen.getByText('Reset via email link')).toBeInTheDocument();
  });

  it('shows header with branding', () => {
    render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);
    expect(screen.getByText('SuperMandi')).toBeInTheDocument();
    expect(screen.getByText('Retailer Portal')).toBeInTheDocument();
  });

  it('shows sign in link', () => {
    render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);
    expect(screen.getByText('Sign In')).toBeInTheDocument();
    expect(screen.getByText(/Remember your password/)).toBeInTheDocument();
  });

  it('navigates to OTP channel and shows phone input', () => {
    render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);
    fireEvent.click(screen.getByText('Reset via mobile OTP'));
    expect(screen.getByText(/Enter your registered phone number/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/98765 43210/)).toBeInTheDocument();
    expect(screen.getByText('Send OTP')).toBeInTheDocument();
  });

  it('shows validation error for invalid phone on OTP channel', async () => {
    render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);
    fireEvent.click(screen.getByText('Reset via mobile OTP'));
    const phoneInput = screen.getByPlaceholderText(/98765 43210/);
    fireEvent.change(phoneInput, { target: { value: '123' } });
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() => {
      expect(screen.getByText(/valid phone number/)).toBeInTheDocument();
    });
  });

  it('navigates to email channel and shows email input', () => {
    render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);
    fireEvent.click(screen.getByText('Reset via email link'));
    expect(screen.getByText(/Enter your registered email address/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/you@example.com/)).toBeInTheDocument();
    expect(screen.getByText('Send Reset Link')).toBeInTheDocument();
  });

  it('renders footer with copyright', () => {
    render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);
    expect(screen.getByText(/SuperMandi Tech Pvt Ltd/)).toBeInTheDocument();
    expect(screen.getByText(/Made in India/)).toBeInTheDocument();
  });

  it('renders build stamp', () => {
    render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);
    expect(screen.getByTestId('build-stamp')).toBeInTheDocument();
  });
});
