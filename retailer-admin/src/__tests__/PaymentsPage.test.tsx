import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PaymentsPage from '../pages/PaymentsPage';

vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({ accessToken: 'test-token' }),
}));

vi.mock('../components/Breadcrumb', () => ({
  default: () => <nav data-testid="breadcrumb">Breadcrumb</nav>,
}));

vi.mock('../components/UpiInput', () => ({
  default: ({ value, onChange, required }: { value: string; onChange: (v: string) => void; required?: boolean }) => (
    <div data-testid="upi-input">
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="UPI VPA" />
      {required && <span>required</span>}
    </div>
  ),
  validateUpiVpa: (v: string) => v ? undefined : 'Invalid',
}));

const mockAuthFetch = vi.fn();
vi.mock('../lib/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
  safeJson: (res: { json: () => Promise<unknown> }) => res.json(),
}));

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/s/TEST/settings/payments']}>
      <Routes>
        <Route path="/s/:storeCode/settings/payments" element={<PaymentsPage />} />
      </Routes>
    </MemoryRouter>
  );

describe('PaymentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Loading payment settings...')).toBeInTheDocument();
  });

  it('renders payment settings form after load', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ settings: { upiVpa: 'store@ybl', bankAccount: '', ifscCode: '' } }),
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Payment Settings')).toBeInTheDocument();
      expect(screen.getByText('UPI Payment')).toBeInTheDocument();
      expect(screen.getByTestId('upi-input')).toBeInTheDocument();
    });
  });

  it('renders bank account section', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ settings: { upiVpa: '', bankAccount: '', ifscCode: '' } }),
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Bank Account (Optional)')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter account number')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('e.g., SBIN0001234')).toBeInTheDocument();
    });
  });

  it('has save button', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ settings: { upiVpa: 'store@ybl', bankAccount: '', ifscCode: '' } }),
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Save Payment Settings')).toBeInTheDocument();
    });
  });

  it('renders breadcrumb', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ settings: { upiVpa: '', bankAccount: '', ifscCode: '' } }),
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
    });
  });

  it('shows description text', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ settings: { upiVpa: '', bankAccount: '', ifscCode: '' } }),
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Configure your payment methods/)).toBeInTheDocument();
    });
  });
});
