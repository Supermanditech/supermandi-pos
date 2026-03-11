// SA-P1-003: SettingsPage Due Limits UI tests
// Tests the due limit configuration section in the retailer settings page

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SettingsPage from '../pages/SettingsPage';

// --- Auth mock ---
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
  validateUpiVpa: () => undefined,
}));

vi.mock('../hooks/useNavigationSafety', () => ({
  useUnsavedChanges: () => {},
}));

vi.mock('../lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const mockAuthFetch = vi.fn();
vi.mock('../lib/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
  safeJson: (res: { json: () => Promise<unknown> }) => res.json(),
}));

// --- Helpers ---

function makeSettingsResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: async () => ({
      success: true,
      settings: {
        storeName: 'Test Store',
        upiVpa: 'store@ybl',
        taxRate: 18,
        operatingHours: { open: '09:00', close: '21:00' },
        receiptFooter: 'Thanks!',
        gstNumber: '',
        address: '',
        phone: '',
        receiptSettings: {},
        bankAccount: '',
        ifscCode: '',
        maxOutstandingDuesPaise: null,
        ...overrides,
      },
    }),
  };
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/s/TEST/settings']}>
      <Routes>
        <Route path="/s/:storeCode/settings" element={<SettingsPage />} />
      </Routes>
    </MemoryRouter>
  );

describe('SettingsPage - Due Limits Section', () => {
  beforeEach(() => {
    mockAuthFetch.mockReset();
    mockAccessToken = 'test-token';
  });

  it('should render due limits section with label and input', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeSettingsResponse());
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Due Limits')).toBeDefined();
    });

    const input = screen.getByLabelText(/Maximum Outstanding Dues/i);
    expect(input).toBeDefined();
  });

  it('should show empty input when no limit is set (null)', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeSettingsResponse({ maxOutstandingDuesPaise: null }));
    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText(/Maximum Outstanding Dues/i)).toBeDefined();
    });

    const input = screen.getByLabelText(/Maximum Outstanding Dues/i) as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('should display limit in rupees when set', async () => {
    // 500000 paise = 5000 rupees
    mockAuthFetch.mockResolvedValueOnce(makeSettingsResponse({ maxOutstandingDuesPaise: 500000 }));
    renderPage();

    await waitFor(() => {
      const input = screen.getByLabelText(/Maximum Outstanding Dues/i) as HTMLInputElement;
      expect(input.value).toBe('5000');
    });
  });

  it('should allow user to set a due limit value', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeSettingsResponse());
    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText(/Maximum Outstanding Dues/i)).toBeDefined();
    });

    const input = screen.getByLabelText(/Maximum Outstanding Dues/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '10000' } });
    expect(input.value).toBe('10000');
  });

  it('should show hint text about blocking dues', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeSettingsResponse());
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/New due sales will be blocked/i)).toBeDefined();
    });
  });

  it('should send maxOutstandingDuesPaise in paise when saving', async () => {
    mockAuthFetch
      .mockResolvedValueOnce(makeSettingsResponse()) // GET
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, settings: {} }) }); // PATCH

    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText(/Maximum Outstanding Dues/i)).toBeDefined();
    });

    // Set limit to 5000 rupees
    const input = screen.getByLabelText(/Maximum Outstanding Dues/i);
    fireEvent.change(input, { target: { value: '5000' } });

    // Click save
    const saveBtn = screen.getByText('Save Settings');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalledTimes(2);
    });

    // Verify the PATCH call includes maxOutstandingDuesPaise in paise
    const patchCall = mockAuthFetch.mock.calls[1];
    const body = JSON.parse(patchCall[2].body);
    expect(body.maxOutstandingDuesPaise).toBe(500000); // 5000 * 100
  });

  it('should send null when due limit is cleared', async () => {
    mockAuthFetch
      .mockResolvedValueOnce(makeSettingsResponse({ maxOutstandingDuesPaise: 500000 })) // GET
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, settings: {} }) }); // PATCH

    renderPage();

    await waitFor(() => {
      const input = screen.getByLabelText(/Maximum Outstanding Dues/i) as HTMLInputElement;
      expect(input.value).toBe('5000');
    });

    // Clear the limit
    const input = screen.getByLabelText(/Maximum Outstanding Dues/i);
    fireEvent.change(input, { target: { value: '' } });

    const saveBtn = screen.getByText('Save Settings');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalledTimes(2);
    });

    const patchCall = mockAuthFetch.mock.calls[1];
    const body = JSON.parse(patchCall[2].body);
    expect(body.maxOutstandingDuesPaise).toBeNull();
  });
});
