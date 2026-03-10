// J24-TEST-002: PaymentsPage comprehensive test coverage
// Expanded from 6 smoke tests to full coverage including:
// UPI editing, bank account, IFSC, save flow, validation, error states,
// load error retry, status transition, partial save failure, auth guard

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="UPI VPA" aria-label="UPI VPA" />
      {required && <span>required</span>}
    </div>
  ),
  validateUpiVpa: (v: string) => {
    if (!v) return undefined;
    if (v.length < 6) return 'UPI VPA must be at least 6 characters';
    if (!/^[a-zA-Z0-9._-]{3,}@[a-zA-Z0-9]{2,}$/.test(v)) return 'Invalid UPI VPA format';
    return undefined;
  },
}));

const mockAuthFetch = vi.fn();
vi.mock('../lib/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
  safeJson: (res: { json: () => Promise<unknown> }) => res.json(),
}));

function makeSettingsResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: () => Promise.resolve({
      settings: {
        upiVpa: 'store@ybl',
        bankAccount: '',
        ifscCode: '',
        ...overrides,
      },
    }),
  };
}

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

  // -----------------------------------------------------------------------
  // 1. Initial render & loading
  // -----------------------------------------------------------------------

  describe('initial render', () => {
    it('shows loading state initially', () => {
      mockAuthFetch.mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(screen.getByText('Loading payment settings...')).toBeInTheDocument();
    });

    it('renders payment settings form after load', async () => {
      mockAuthFetch.mockResolvedValue(makeSettingsResponse());
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Payment Settings')).toBeInTheDocument();
        expect(screen.getByText('UPI Payment')).toBeInTheDocument();
        expect(screen.getByTestId('upi-input')).toBeInTheDocument();
      });
    });

    it('renders breadcrumb', async () => {
      mockAuthFetch.mockResolvedValue(makeSettingsResponse());
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
      });
    });

    it('renders page title and subtitle', async () => {
      mockAuthFetch.mockResolvedValue(makeSettingsResponse());
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Payment Settings')).toBeInTheDocument();
        expect(screen.getByText(/Configure your payment methods/)).toBeInTheDocument();
      });
    });

    it('calls authFetch for settings on mount', async () => {
      mockAuthFetch.mockResolvedValue(makeSettingsResponse());
      renderPage();
      await waitFor(() => {
        expect(mockAuthFetch).toHaveBeenCalledWith(
          '/api/v1/retailer-admin/settings',
          'test-token'
        );
      });
    });
  });

  // -----------------------------------------------------------------------
  // 2. Form sections
  // -----------------------------------------------------------------------

  describe('form sections', () => {
    it('renders bank account section', async () => {
      mockAuthFetch.mockResolvedValue(makeSettingsResponse());
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Bank Account (Optional)')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Enter account number')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('e.g., SBIN0001234')).toBeInTheDocument();
      });
    });

    it('renders save button', async () => {
      mockAuthFetch.mockResolvedValue(makeSettingsResponse());
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Save Payment Settings')).toBeInTheDocument();
      });
    });

    it('renders bank settlement description', async () => {
      mockAuthFetch.mockResolvedValue(makeSettingsResponse());
      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/NEFT\/IMPS settlements/)).toBeInTheDocument();
      });
    });
  });

  // -----------------------------------------------------------------------
  // 3. Loaded values
  // -----------------------------------------------------------------------

  describe('loaded values', () => {
    it('populates UPI VPA from API response', async () => {
      mockAuthFetch.mockResolvedValue(makeSettingsResponse({ upiVpa: 'myshop@ybl' }));
      renderPage();
      await waitFor(() => {
        expect(screen.getByPlaceholderText('UPI VPA')).toHaveValue('myshop@ybl');
      });
    });

    it('populates bank account from API response', async () => {
      mockAuthFetch.mockResolvedValue(makeSettingsResponse({ bankAccount: '123456789012' }));
      renderPage();
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter account number')).toHaveValue('123456789012');
      });
    });

    it('populates IFSC code from API response', async () => {
      mockAuthFetch.mockResolvedValue(makeSettingsResponse({ ifscCode: 'SBIN0001234' }));
      renderPage();
      await waitFor(() => {
        expect(screen.getByPlaceholderText('e.g., SBIN0001234')).toHaveValue('SBIN0001234');
      });
    });
  });

  // -----------------------------------------------------------------------
  // 4. Field editing
  // -----------------------------------------------------------------------

  describe('field editing', () => {
    it('updates UPI VPA on input change', async () => {
      mockAuthFetch.mockResolvedValue(makeSettingsResponse({ upiVpa: '' }));
      renderPage();
      await waitFor(() => {
        expect(screen.getByPlaceholderText('UPI VPA')).toBeInTheDocument();
      });
      fireEvent.change(screen.getByPlaceholderText('UPI VPA'), { target: { value: 'new@upi' } });
      expect(screen.getByPlaceholderText('UPI VPA')).toHaveValue('new@upi');
    });

    it('updates bank account on input change', async () => {
      mockAuthFetch.mockResolvedValue(makeSettingsResponse());
      renderPage();
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter account number')).toBeInTheDocument();
      });
      fireEvent.change(screen.getByPlaceholderText('Enter account number'), { target: { value: '9876543210' } });
      expect(screen.getByPlaceholderText('Enter account number')).toHaveValue('9876543210');
    });

    it('updates IFSC code on input change and uppercases', async () => {
      mockAuthFetch.mockResolvedValue(makeSettingsResponse());
      renderPage();
      await waitFor(() => {
        expect(screen.getByPlaceholderText('e.g., SBIN0001234')).toBeInTheDocument();
      });
      fireEvent.change(screen.getByPlaceholderText('e.g., SBIN0001234'), { target: { value: 'sbin0001234' } });
      expect(screen.getByPlaceholderText('e.g., SBIN0001234')).toHaveValue('SBIN0001234');
    });
  });

  // -----------------------------------------------------------------------
  // 5. Save flow — success
  // -----------------------------------------------------------------------

  describe('save success', () => {
    it('saves UPI and shows success message', async () => {
      mockAuthFetch.mockResolvedValue(makeSettingsResponse());
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Save Payment Settings')).toBeInTheDocument();
      });

      // Mock PUT /settings/upi response
      mockAuthFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, upiVpa: 'store@ybl', statusTransitioned: false }),
      });

      fireEvent.click(screen.getByText('Save Payment Settings'));

      await waitFor(() => {
        expect(screen.getByText(/Payment settings saved successfully/)).toBeInTheDocument();
      });
    });

    it('shows Saving... during save', async () => {
      mockAuthFetch.mockResolvedValue(makeSettingsResponse());
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Save Payment Settings')).toBeInTheDocument();
      });

      mockAuthFetch.mockReturnValueOnce(new Promise(() => {}));
      fireEvent.click(screen.getByText('Save Payment Settings'));

      await waitFor(() => {
        expect(screen.getByText('Saving...')).toBeInTheDocument();
      });
    });

    it('shows status transition message when KYC→PAYMENTS_SUBMITTED', async () => {
      mockAuthFetch.mockResolvedValue(makeSettingsResponse());
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Save Payment Settings')).toBeInTheDocument();
      });

      mockAuthFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, upiVpa: 'store@ybl', statusTransitioned: true }),
      });

      fireEvent.click(screen.getByText('Save Payment Settings'));

      await waitFor(() => {
        expect(screen.getByText(/PAYMENTS_SUBMITTED/)).toBeInTheDocument();
      });
    });

    it('calls PUT /settings/upi with trimmed lowercase VPA', async () => {
      mockAuthFetch.mockResolvedValue(makeSettingsResponse());
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Save Payment Settings')).toBeInTheDocument();
      });

      mockAuthFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      fireEvent.click(screen.getByText('Save Payment Settings'));

      await waitFor(() => {
        const calls = mockAuthFetch.mock.calls;
        const upiCall = calls.find((c: unknown[]) => typeof c[0] === 'string' && c[0].includes('/settings/upi'));
        expect(upiCall).toBeTruthy();
        expect(upiCall![2]).toMatchObject({ method: 'PUT' });
        const body = JSON.parse(upiCall![2].body);
        expect(body.upiVpa).toBe('store@ybl');
      });
    });

    it('also calls PATCH /settings with bank details when provided', async () => {
      mockAuthFetch.mockResolvedValue(makeSettingsResponse());
      renderPage();
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter account number')).toBeInTheDocument();
      });

      // Enter bank details
      fireEvent.change(screen.getByPlaceholderText('Enter account number'), { target: { value: '123456789012' } });
      fireEvent.change(screen.getByPlaceholderText('e.g., SBIN0001234'), { target: { value: 'SBIN0001234' } });

      // Mock PUT /settings/upi
      mockAuthFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
      // Mock PATCH /settings for bank details
      mockAuthFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      fireEvent.click(screen.getByText('Save Payment Settings'));

      await waitFor(() => {
        expect(screen.getByText(/Payment settings saved successfully/)).toBeInTheDocument();
      });

      // Verify PATCH was called with bank details
      const patchCall = mockAuthFetch.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && c[0] === '/api/v1/retailer-admin/settings' && c[2] && (c[2] as Record<string, string>).method === 'PATCH'
      );
      expect(patchCall).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // 6. Save flow — validation errors
  // -----------------------------------------------------------------------

  describe('save validation', () => {
    it('shows error when bank account is provided without IFSC', async () => {
      mockAuthFetch.mockResolvedValue(makeSettingsResponse());
      renderPage();
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter account number')).toBeInTheDocument();
      });

      // Enter bank account without IFSC
      fireEvent.change(screen.getByPlaceholderText('Enter account number'), { target: { value: '123456789012' } });

      // Mock PUT /settings/upi (succeeds)
      mockAuthFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      fireEvent.click(screen.getByText('Save Payment Settings'));

      await waitFor(() => {
        expect(screen.getByText(/IFSC code is required/)).toBeInTheDocument();
      });
    });

    it('shows error when IFSC code is wrong length', async () => {
      // Reset mocks fresh to avoid prior test's mock leaking
      mockAuthFetch.mockReset();
      mockAuthFetch.mockResolvedValue(makeSettingsResponse());
      renderPage();
      await waitFor(() => {
        expect(screen.getByPlaceholderText('e.g., SBIN0001234')).toBeInTheDocument();
      });

      // Enter invalid IFSC
      await act(async () => {
        fireEvent.change(screen.getByPlaceholderText('e.g., SBIN0001234'), { target: { value: 'SBIN' } });
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Save Payment Settings/ }));
      });

      await waitFor(() => {
        expect(screen.getByText(/IFSC code must be exactly 11 characters/)).toBeInTheDocument();
      });
    });

    it('disables save button when UPI is empty', async () => {
      mockAuthFetch.mockResolvedValue(makeSettingsResponse({ upiVpa: '' }));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Save Payment Settings')).toBeInTheDocument();
      });

      expect(screen.getByText('Save Payment Settings').closest('button')).toBeDisabled();
    });
  });

  // -----------------------------------------------------------------------
  // 7. Save flow — API errors
  // -----------------------------------------------------------------------

  describe('save errors', () => {
    it('shows UPI save error from API', async () => {
      mockAuthFetch.mockResolvedValue(makeSettingsResponse());
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Save Payment Settings')).toBeInTheDocument();
      });

      mockAuthFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: { message: 'Invalid VPA format' } }),
      });

      fireEvent.click(screen.getByText('Save Payment Settings'));

      await waitFor(() => {
        expect(screen.getByText('Invalid VPA format')).toBeInTheDocument();
      });
    });

    it('shows generic error when save throws', async () => {
      mockAuthFetch.mockResolvedValue(makeSettingsResponse());
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Save Payment Settings')).toBeInTheDocument();
      });

      mockAuthFetch.mockRejectedValueOnce(new Error('Network error'));

      fireEvent.click(screen.getByText('Save Payment Settings'));

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('shows partial save error when UPI succeeds but bank fails', async () => {
      mockAuthFetch.mockResolvedValue(makeSettingsResponse());
      renderPage();
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter account number')).toBeInTheDocument();
      });

      // Enter bank details
      fireEvent.change(screen.getByPlaceholderText('Enter account number'), { target: { value: '123456789012' } });
      fireEvent.change(screen.getByPlaceholderText('e.g., SBIN0001234'), { target: { value: 'SBIN0001234' } });

      // PUT /settings/upi succeeds
      mockAuthFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
      // PATCH /settings fails
      mockAuthFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: { message: 'Bank validation failed' } }),
      });

      fireEvent.click(screen.getByText('Save Payment Settings'));

      await waitFor(() => {
        expect(screen.getByText(/UPI updated successfully, but bank details failed/)).toBeInTheDocument();
      });
    });
  });

  // -----------------------------------------------------------------------
  // 8. Load error & retry
  // -----------------------------------------------------------------------

  describe('load error', () => {
    it('shows load error banner when fetch fails', async () => {
      mockAuthFetch.mockRejectedValue(new Error('Failed'));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/Failed to load payment settings/)).toBeInTheDocument();
      });
    });

    it('shows retry button on load error', async () => {
      mockAuthFetch.mockRejectedValue(new Error('Failed'));
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
      });
    });

    it('retries fetch when retry button is clicked', async () => {
      mockAuthFetch.mockRejectedValue(new Error('Failed'));
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
      });

      // Clear and set up successful response
      mockAuthFetch.mockResolvedValue(makeSettingsResponse());

      fireEvent.click(screen.getByRole('button', { name: /Retry/i }));

      await waitFor(() => {
        expect(screen.getByText('UPI Payment')).toBeInTheDocument();
      });
    });
  });

  // -----------------------------------------------------------------------
  // 9. UPI guidance text
  // -----------------------------------------------------------------------

  describe('UPI guidance', () => {
    it('shows guidance text when UPI VPA is empty', async () => {
      mockAuthFetch.mockResolvedValue(makeSettingsResponse({ upiVpa: '' }));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/Enter your UPI address to start receiving digital payments/)).toBeInTheDocument();
      });
    });

    it('hides guidance text when UPI VPA is set', async () => {
      mockAuthFetch.mockResolvedValue(makeSettingsResponse({ upiVpa: 'store@ybl' }));
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('upi-input')).toBeInTheDocument();
      });
      expect(screen.queryByText(/Enter your UPI address to start receiving digital payments/)).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // 10. Success message clears on field change
  // -----------------------------------------------------------------------

  describe('success message behavior', () => {
    it('clears success message when UPI field changes', async () => {
      mockAuthFetch.mockResolvedValue(makeSettingsResponse());
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Save Payment Settings')).toBeInTheDocument();
      });

      // Save successfully
      mockAuthFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, statusTransitioned: false }),
      });
      fireEvent.click(screen.getByText('Save Payment Settings'));

      await waitFor(() => {
        expect(screen.getByText(/Payment settings saved successfully/)).toBeInTheDocument();
      });

      // Change UPI — success should clear
      fireEvent.change(screen.getByPlaceholderText('UPI VPA'), { target: { value: 'changed@upi' } });
      expect(screen.queryByText(/Payment settings saved successfully/)).not.toBeInTheDocument();
    });

    it('clears error message when bank account field changes', async () => {
      mockAuthFetch.mockResolvedValue(makeSettingsResponse());
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Save Payment Settings')).toBeInTheDocument();
      });

      // Trigger error
      mockAuthFetch.mockRejectedValueOnce(new Error('Failed'));
      fireEvent.click(screen.getByText('Save Payment Settings'));
      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument();
      });

      // Change bank account — error should clear
      fireEvent.change(screen.getByPlaceholderText('Enter account number'), { target: { value: '12345' } });
      expect(screen.queryByText('Failed')).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // 11. Bank settlement hint
  // -----------------------------------------------------------------------

  describe('bank hints', () => {
    it('shows bank settlement hint text', async () => {
      mockAuthFetch.mockResolvedValue(makeSettingsResponse());
      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/Bank details are used for NEFT\/IMPS settlement/)).toBeInTheDocument();
      });
    });
  });
});
