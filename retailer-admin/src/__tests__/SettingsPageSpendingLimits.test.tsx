// SA-P1-002: SettingsPage spending limits UI tests

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SettingsPage from '../pages/SettingsPage';

// --- Mocks ---
let mockAccessToken: string | null = 'test-token';
vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({
    accessToken: mockAccessToken,
    store: { name: 'Test Store' },
    logout: vi.fn(),
  }),
}));

vi.mock('../components/Breadcrumb', () => ({
  default: () => <nav data-testid="breadcrumb">Breadcrumb</nav>,
}));

vi.mock('../components/UpiInput', () => ({
  validateUpiVpa: (v: string) => (v && v.includes('@') ? undefined : 'Invalid UPI'),
}));

vi.mock('../hooks/useNavigationSafety', () => ({
  useUnsavedChanges: vi.fn(),
}));

vi.mock('../lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const mockAuthFetch = vi.fn();
vi.mock('../lib/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
  safeJson: (res: { json: () => Promise<unknown> }) => res.json(),
}));

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/s/TEST/settings']}>
      <Routes>
        <Route path="/s/:storeCode/settings" element={<SettingsPage />} />
      </Routes>
    </MemoryRouter>
  );

const makeSettingsResponse = (overrides: Record<string, unknown> = {}) => ({
  ok: true,
  json: async () => ({
    settings: {
      storeName: 'Test Store',
      upiVpa: 'store@ybl',
      taxRate: 18,
      operatingHours: { open: '09:00', close: '21:00' },
      receiptFooter: '',
      gstNumber: '',
      address: '',
      phone: '',
      receiptSettings: {},
      bankAccount: '',
      ifscCode: '',
      dailyOrderLimitPaise: null,
      monthlyOrderLimitPaise: null,
      ...overrides,
    },
  }),
});

describe('SettingsPage — Spending Limits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockAccessToken = 'test-token';
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('renders spending limits section with empty fields when no limits set', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeSettingsResponse());
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Purchase Order Spending Limits')).toBeTruthy();
    });

    const dailyInput = screen.getByLabelText('Daily Order Limit (Rs)') as HTMLInputElement;
    const monthlyInput = screen.getByLabelText('Monthly Order Limit (Rs)') as HTMLInputElement;

    expect(dailyInput.value).toBe('');
    expect(monthlyInput.value).toBe('');
  });

  it('displays existing limits converted from paise to rupees', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeSettingsResponse({
      dailyOrderLimitPaise: 5000000,    // Rs 50,000
      monthlyOrderLimitPaise: 20000000, // Rs 2,00,000
    }));
    renderPage();

    await waitFor(() => {
      const dailyInput = screen.getByLabelText('Daily Order Limit (Rs)') as HTMLInputElement;
      expect(dailyInput.value).toBe('50000');
    });

    const monthlyInput = screen.getByLabelText('Monthly Order Limit (Rs)') as HTMLInputElement;
    expect(monthlyInput.value).toBe('200000');
  });

  it('saves spending limits via PATCH endpoint', async () => {
    mockAuthFetch
      .mockResolvedValueOnce(makeSettingsResponse())
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          spendingLimits: { dailyOrderLimitPaise: 1000000, monthlyOrderLimitPaise: 5000000 },
        }),
      });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Purchase Order Spending Limits')).toBeTruthy();
    });

    const dailyInput = screen.getByLabelText('Daily Order Limit (Rs)');
    const monthlyInput = screen.getByLabelText('Monthly Order Limit (Rs)');

    fireEvent.change(dailyInput, { target: { value: '10000' } });
    fireEvent.change(monthlyInput, { target: { value: '50000' } });

    const saveBtn = screen.getByText('Save Spending Limits');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalledWith(
        '/api/v1/retailer-admin/store/spending-limits',
        'test-token',
        expect.objectContaining({
          method: 'PATCH',
        })
      );
    });
  });

  it('shows success message after saving', async () => {
    mockAuthFetch
      .mockResolvedValueOnce(makeSettingsResponse())
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, spendingLimits: {} }),
      });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Save Spending Limits')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Save Spending Limits'));

    await waitFor(() => {
      expect(screen.getByText('Spending limits saved successfully!')).toBeTruthy();
    });
  });

  it('shows error when daily limit exceeds monthly limit', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeSettingsResponse({
      dailyOrderLimitPaise: null,
      monthlyOrderLimitPaise: null,
    }));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Save Spending Limits')).toBeTruthy();
    });

    const dailyInput = screen.getByLabelText('Daily Order Limit (Rs)');
    const monthlyInput = screen.getByLabelText('Monthly Order Limit (Rs)');

    fireEvent.change(dailyInput, { target: { value: '100000' } });
    fireEvent.change(monthlyInput, { target: { value: '50000' } });

    fireEvent.click(screen.getByText('Save Spending Limits'));

    await waitFor(() => {
      expect(screen.getByText('Daily limit cannot exceed monthly limit')).toBeTruthy();
    });

    // Should NOT call the API
    expect(mockAuthFetch).toHaveBeenCalledTimes(1); // only initial load
  });

  it('shows error message on save failure', async () => {
    mockAuthFetch
      .mockResolvedValueOnce(makeSettingsResponse())
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: 'Server error' } }),
      });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Save Spending Limits')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Save Spending Limits'));

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeTruthy();
    });
  });

  it('clears limit to null when input is emptied', async () => {
    mockAuthFetch
      .mockResolvedValueOnce(makeSettingsResponse({
        dailyOrderLimitPaise: 5000000,
        monthlyOrderLimitPaise: 20000000,
      }))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, spendingLimits: {} }),
      });

    renderPage();

    await waitFor(() => {
      const dailyInput = screen.getByLabelText('Daily Order Limit (Rs)') as HTMLInputElement;
      expect(dailyInput.value).toBe('50000');
    });

    const dailyInput = screen.getByLabelText('Daily Order Limit (Rs)');
    fireEvent.change(dailyInput, { target: { value: '' } });

    fireEvent.click(screen.getByText('Save Spending Limits'));

    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalledTimes(2);
      const callArgs = mockAuthFetch.mock.calls[1];
      const body = JSON.parse(callArgs[2].body);
      expect(body.dailyOrderLimitPaise).toBeNull();
    });
  });
});
