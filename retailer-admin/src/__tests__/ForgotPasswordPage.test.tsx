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

  it('renders initial phone step', () => {
    render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);
    expect(screen.getByText('Reset Password')).toBeInTheDocument();
    expect(screen.getByText(/Enter your phone number/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/9876543210/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/MYSTORE/)).toBeInTheDocument();
    expect(screen.getByText('Verify Account')).toBeInTheDocument();
  });

  it('shows header with branding', () => {
    render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);
    expect(screen.getByText('SuperManditech')).toBeInTheDocument();
    expect(screen.getByText('Retailer Portal')).toBeInTheDocument();
  });

  it('shows sign in link', () => {
    render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);
    expect(screen.getByText('Sign In')).toBeInTheDocument();
    expect(screen.getByText(/Remember your password/)).toBeInTheDocument();
  });

  it('shows validation error for invalid phone', async () => {
    render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);
    const phoneInput = screen.getByPlaceholderText(/9876543210/);
    const storeInput = screen.getByPlaceholderText(/MYSTORE/);
    fireEvent.change(phoneInput, { target: { value: '123' } });
    fireEvent.change(storeInput, { target: { value: 'TEST' } });
    fireEvent.click(screen.getByText('Verify Account'));
    await waitFor(() => {
      expect(screen.getByText(/valid phone number/)).toBeInTheDocument();
    });
  });

  it('shows validation error for empty store code', async () => {
    render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);
    const phoneInput = screen.getByPlaceholderText(/9876543210/);
    fireEvent.change(phoneInput, { target: { value: '9876543210' } });
    // Use fireEvent.submit on the form to ensure onSubmit fires
    const form = phoneInput.closest('form')!;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByText(/Please enter your store code/)).toBeInTheDocument();
    });
  });

  it('renders footer with copyright', () => {
    render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);
    expect(screen.getByText(/SuperManditech. All rights reserved/)).toBeInTheDocument();
  });

  it('renders build stamp', () => {
    render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);
    expect(screen.getByTestId('build-stamp')).toBeInTheDocument();
  });
});
