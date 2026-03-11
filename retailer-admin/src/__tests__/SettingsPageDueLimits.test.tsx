// SA-P1-003: SettingsPage due limits UI tests

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
      maxOutstandingDuesPaise: null,
      ...overrides,
    },
  }),
});

describe('SettingsPage — Due Limits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccessToken = 'test-token';
  });

  it('renders due limits section with empty field when no limit set', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeSettingsResponse());
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Outstanding Due Limits')).toBeTruthy();
    });

    const input = screen.getByLabelText('Max Outstanding Dues (Rs)') as HTMLInputElement;
    expect(input.value).toBe('');
    expect(input.placeholder).toBe('No limit');
  });

  it('renders due limit value when set (converts paise to rupees)', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeSettingsResponse({ maxOutstandingDuesPaise: 5000000 }));
    renderPage();

    await waitFor(() => {
      const input = screen.getByLabelText('Max Outstanding Dues (Rs)') as HTMLInputElement;
      expect(input.value).toBe('50000');
    });
  });

  it('renders save due limits button', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeSettingsResponse());
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Save Due Limits')).toBeTruthy();
    });
  });

  it('calls PATCH /store/due-limits on save', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeSettingsResponse({ maxOutstandingDuesPaise: 1000000 }));
    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Max Outstanding Dues (Rs)')).toBeTruthy();
    });

    // Mock the save call
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, dueLimits: { maxOutstandingDuesPaise: 1000000 } }),
    });

    fireEvent.click(screen.getByText('Save Due Limits'));

    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalledWith(
        '/api/v1/retailer-admin/store/due-limits',
        'test-token',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ maxOutstandingDuesPaise: 1000000 }),
        })
      );
    });
  });

  it('shows success message after saving', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeSettingsResponse({ maxOutstandingDuesPaise: 1000000 }));
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Save Due Limits')).toBeTruthy();
    });

    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, dueLimits: { maxOutstandingDuesPaise: 1000000 } }),
    });

    fireEvent.click(screen.getByText('Save Due Limits'));

    await waitFor(() => {
      expect(screen.getByText('Due limits saved successfully!')).toBeTruthy();
    });
  });

  it('shows error message on save failure', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeSettingsResponse());
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Save Due Limits')).toBeTruthy();
    });

    mockAuthFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { message: 'Validation failed' } }),
    });

    fireEvent.click(screen.getByText('Save Due Limits'));

    await waitFor(() => {
      expect(screen.getByText('Validation failed')).toBeTruthy();
    });
  });

  it('converts rupee input to paise for the API call', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeSettingsResponse());
    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Max Outstanding Dues (Rs)')).toBeTruthy();
    });

    const input = screen.getByLabelText('Max Outstanding Dues (Rs)') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '500' } });

    // Mock save
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, dueLimits: { maxOutstandingDuesPaise: 50000 } }),
    });

    fireEvent.click(screen.getByText('Save Due Limits'));

    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalledWith(
        '/api/v1/retailer-admin/store/due-limits',
        'test-token',
        expect.objectContaining({
          body: JSON.stringify({ maxOutstandingDuesPaise: 50000 }),
        })
      );
    });
  });

  it('sends null when input is cleared (remove limit)', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeSettingsResponse({ maxOutstandingDuesPaise: 1000000 }));
    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Max Outstanding Dues (Rs)')).toBeTruthy();
    });

    const input = screen.getByLabelText('Max Outstanding Dues (Rs)') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });

    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, dueLimits: { maxOutstandingDuesPaise: null } }),
    });

    fireEvent.click(screen.getByText('Save Due Limits'));

    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalledWith(
        '/api/v1/retailer-admin/store/due-limits',
        'test-token',
        expect.objectContaining({
          body: JSON.stringify({ maxOutstandingDuesPaise: null }),
        })
      );
    });
  });

  it('does not interfere with spending limits section', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeSettingsResponse({
      dailyOrderLimitPaise: 100000,
      monthlyOrderLimitPaise: 500000,
      maxOutstandingDuesPaise: 200000,
    }));
    renderPage();

    await waitFor(() => {
      // Both sections should render
      expect(screen.getByText('Purchase Order Spending Limits')).toBeTruthy();
      expect(screen.getByText('Outstanding Due Limits')).toBeTruthy();

      // Spending limits values preserved
      const dailyInput = screen.getByLabelText('Daily Order Limit (Rs)') as HTMLInputElement;
      expect(dailyInput.value).toBe('1000');

      // Due limits value rendered
      const dueInput = screen.getByLabelText('Max Outstanding Dues (Rs)') as HTMLInputElement;
      expect(dueInput.value).toBe('2000');
    });
  });
});
