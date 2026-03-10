// J26-TEST-001: DeviceActivationPage comprehensive test coverage
// Expanded from 8 smoke tests to full coverage including:
// Activation flow, deactivation/reactivation with modal, error handling,
// code formatting, device list rendering, loading/empty states, auth guard,
// refresh, network errors, 401 handling, success clearing

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DeviceActivationPage from '../pages/DeviceActivationPage';

let mockAccessToken: string | null = 'test-token';
vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({
    accessToken: mockAccessToken,
    store: { id: 's1', name: 'Test Store', code: 'TEST' },
  }),
}));

vi.mock('../components/Breadcrumb', () => ({
  default: () => <nav data-testid="breadcrumb">Breadcrumb</nav>,
}));

vi.mock('../components/Modal', () => ({
  default: ({ isOpen, onClose, title, children, actions }: {
    isOpen: boolean; onClose: () => void; title: string;
    children: React.ReactNode; actions?: React.ReactNode;
  }) => isOpen ? (
    <div data-testid="modal" role="dialog">
      <h3>{title}</h3>
      <div>{children}</div>
      <div>{actions}</div>
    </div>
  ) : null,
}));

vi.mock('../lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const mockAuthFetch = vi.fn();
vi.mock('../lib/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
  safeJson: (res: { json: () => Promise<unknown> }) => res.json(),
}));

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/s/TEST/devices']}>
      <Routes>
        <Route path="/s/:storeCode/devices" element={<DeviceActivationPage />} />
      </Routes>
    </MemoryRouter>
  );

// Helper: make a device list response
function makeDevicesResponse(devices: Partial<{
  id: string; label: string; deviceType: string; isActive: boolean;
  createdAt: string; manufacturer: string; model: string; appVersion: string;
  lastSeen: string; fingerprint: string;
}>[]) {
  return {
    ok: true,
    json: () => Promise.resolve({ devices }),
  };
}

// Helper: make an activation response
function makeActivationResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: () => Promise.resolve({ success: true, device_id: 'dev-abcd-1234-efgh', ...overrides }),
  };
}

// Helper: make an error response
function makeErrorResponse(code: string, message: string, status = 400) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({ error: { code, message } }),
  };
}

// Standard device fixtures
const activeDevice = {
  id: 'dev-1234-abcd-efgh-5678',
  label: 'POS Terminal 1',
  deviceType: 'RETAILER_PHONE',
  isActive: true,
  createdAt: '2026-01-15T10:00:00Z',
  manufacturer: 'Samsung',
  model: 'Galaxy A14',
  appVersion: '1.2.0',
  lastSeen: '2026-03-10T08:30:00Z',
  fingerprint: 'fp-abc123',
};

const revokedDevice = {
  id: 'dev-9876-zyxw-vuts-5432',
  label: 'Old Tablet',
  deviceType: 'OEM_HANDHELD',
  isActive: false,
  createdAt: '2025-12-01T09:00:00Z',
  manufacturer: 'Lenovo',
  model: 'Tab M10',
  appVersion: '1.0.0',
  fingerprint: 'fp-xyz789',
};

// --- Tests ---

describe('DeviceActivationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthFetch.mockReset();
    mockAccessToken = 'test-token';
  });

  // -----------------------------------------------------------------------
  // 1. Initial render & header
  // -----------------------------------------------------------------------

  describe('initial render', () => {
    it('renders page header and activation form', async () => {
      mockAuthFetch.mockResolvedValue(makeDevicesResponse([]));
      renderPage();
      expect(screen.getByText('Device Activation')).toBeInTheDocument();
      expect(screen.getByText('Activate New Device')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('SM-XXXX-XX')).toBeInTheDocument();
    });

    it('shows store name in subtitle', async () => {
      mockAuthFetch.mockResolvedValue(makeDevicesResponse([]));
      renderPage();
      expect(screen.getByText(/Test Store/)).toBeInTheDocument();
    });

    it('renders breadcrumb', () => {
      mockAuthFetch.mockResolvedValue(makeDevicesResponse([]));
      renderPage();
      expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
    });

    it('shows activation instructions', () => {
      mockAuthFetch.mockResolvedValue(makeDevicesResponse([]));
      renderPage();
      expect(screen.getByText('How to get an activation code:')).toBeInTheDocument();
      expect(screen.getByText(/Open the SuperMandi POS app/)).toBeInTheDocument();
      expect(screen.getByText(/Enter that code above within 15 minutes/)).toBeInTheDocument();
    });

    it('shows Connected Devices section title', async () => {
      mockAuthFetch.mockResolvedValue(makeDevicesResponse([]));
      renderPage();
      expect(screen.getByText('Connected Devices')).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // 2. Auth guard
  // -----------------------------------------------------------------------

  describe('auth guard', () => {
    it('shows Loading... when no accessToken', () => {
      mockAccessToken = null;
      renderPage();
      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(screen.queryByText('Device Activation')).not.toBeInTheDocument();
    });

    it('does not fetch devices when no accessToken', () => {
      mockAccessToken = null;
      renderPage();
      expect(mockAuthFetch).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 3. Device list states
  // -----------------------------------------------------------------------

  describe('device list', () => {
    it('shows empty state when no devices', async () => {
      mockAuthFetch.mockResolvedValue(makeDevicesResponse([]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/No devices connected yet/)).toBeInTheDocument();
      });
    });

    it('shows loading state on initial load', async () => {
      mockAuthFetch.mockReturnValue(new Promise(() => {})); // never resolves
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Loading devices...')).toBeInTheDocument();
      });
    });

    it('renders active device with ACTIVE badge', async () => {
      mockAuthFetch.mockResolvedValue(makeDevicesResponse([activeDevice]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('POS Terminal 1')).toBeInTheDocument();
        expect(screen.getByText('ACTIVE')).toBeInTheDocument();
      });
    });

    it('renders revoked device with REVOKED badge', async () => {
      mockAuthFetch.mockResolvedValue(makeDevicesResponse([revokedDevice]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Old Tablet')).toBeInTheDocument();
        expect(screen.getByText('REVOKED')).toBeInTheDocument();
      });
    });

    it('shows device manufacturer and model', async () => {
      mockAuthFetch.mockResolvedValue(makeDevicesResponse([activeDevice]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/Samsung Galaxy A14/)).toBeInTheDocument();
      });
    });

    it('shows app version', async () => {
      mockAuthFetch.mockResolvedValue(makeDevicesResponse([activeDevice]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/v1\.2\.0/)).toBeInTheDocument();
      });
    });

    it('shows deviceType when no manufacturer/model', async () => {
      const device = { ...activeDevice, manufacturer: undefined, model: undefined };
      mockAuthFetch.mockResolvedValue(makeDevicesResponse([device]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/RETAILER_PHONE/)).toBeInTheDocument();
      });
    });

    it('shows truncated device ID', async () => {
      mockAuthFetch.mockResolvedValue(makeDevicesResponse([activeDevice]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('dev-1234...')).toBeInTheDocument();
      });
    });

    it('shows Added date', async () => {
      mockAuthFetch.mockResolvedValue(makeDevicesResponse([activeDevice]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/Added:/)).toBeInTheDocument();
      });
    });

    it('shows Last seen when available', async () => {
      mockAuthFetch.mockResolvedValue(makeDevicesResponse([activeDevice]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/Last seen:/)).toBeInTheDocument();
      });
    });

    it('shows default label when device has no label', async () => {
      const device = { ...activeDevice, label: '' };
      mockAuthFetch.mockResolvedValue(makeDevicesResponse([device]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('POS Device')).toBeInTheDocument();
      });
    });

    it('renders multiple devices', async () => {
      mockAuthFetch.mockResolvedValue(makeDevicesResponse([activeDevice, revokedDevice]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('POS Terminal 1')).toBeInTheDocument();
        expect(screen.getByText('Old Tablet')).toBeInTheDocument();
        expect(screen.getByText('ACTIVE')).toBeInTheDocument();
        expect(screen.getByText('REVOKED')).toBeInTheDocument();
      });
    });

    it('shows Deactivate button for active device', async () => {
      mockAuthFetch.mockResolvedValue(makeDevicesResponse([activeDevice]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Deactivate')).toBeInTheDocument();
      });
    });

    it('shows Reactivate button for revoked device', async () => {
      mockAuthFetch.mockResolvedValue(makeDevicesResponse([revokedDevice]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Reactivate')).toBeInTheDocument();
      });
    });
  });

  // -----------------------------------------------------------------------
  // 4. Code formatting & validation
  // -----------------------------------------------------------------------

  describe('activation code formatting', () => {
    it('formats raw alphanumeric to SM-XXXX-XX', () => {
      mockAuthFetch.mockResolvedValue(makeDevicesResponse([]));
      renderPage();
      const input = screen.getByPlaceholderText('SM-XXXX-XX');
      fireEvent.change(input, { target: { value: 'ABC123' } });
      expect(input).toHaveValue('SM-ABC1-23');
    });

    it('preserves SM- prefix when already typed', () => {
      mockAuthFetch.mockResolvedValue(makeDevicesResponse([]));
      renderPage();
      const input = screen.getByPlaceholderText('SM-XXXX-XX');
      fireEvent.change(input, { target: { value: 'SM-ABCD-12' } });
      expect(input).toHaveValue('SM-ABCD-12');
    });

    it('converts lowercase to uppercase', () => {
      mockAuthFetch.mockResolvedValue(makeDevicesResponse([]));
      renderPage();
      const input = screen.getByPlaceholderText('SM-XXXX-XX');
      fireEvent.change(input, { target: { value: 'abcd12' } });
      expect(input).toHaveValue('SM-ABCD-12');
    });

    it('strips special characters', () => {
      mockAuthFetch.mockResolvedValue(makeDevicesResponse([]));
      renderPage();
      const input = screen.getByPlaceholderText('SM-XXXX-XX');
      fireEvent.change(input, { target: { value: 'A@B#C$D!1%2' } });
      expect(input).toHaveValue('SM-ABCD-12');
    });

    it('truncates at 6 characters after prefix', () => {
      mockAuthFetch.mockResolvedValue(makeDevicesResponse([]));
      renderPage();
      const input = screen.getByPlaceholderText('SM-XXXX-XX');
      fireEvent.change(input, { target: { value: 'ABCDEF99' } });
      expect(input).toHaveValue('SM-ABCD-EF');
    });

    it('handles partial input (< 4 chars)', () => {
      mockAuthFetch.mockResolvedValue(makeDevicesResponse([]));
      renderPage();
      const input = screen.getByPlaceholderText('SM-XXXX-XX');
      fireEvent.change(input, { target: { value: 'AB' } });
      expect(input).toHaveValue('SM-AB');
    });

    it('returns empty string for empty input', () => {
      mockAuthFetch.mockResolvedValue(makeDevicesResponse([]));
      renderPage();
      const input = screen.getByPlaceholderText('SM-XXXX-XX');
      fireEvent.change(input, { target: { value: 'AB' } });
      expect(input).toHaveValue('SM-AB');
      fireEvent.change(input, { target: { value: '' } });
      expect(input).toHaveValue('');
    });

    it('disables activate button for invalid code', () => {
      mockAuthFetch.mockResolvedValue(makeDevicesResponse([]));
      renderPage();
      expect(screen.getByText('Activate Device')).toBeDisabled();
    });

    it('enables activate button for valid code', () => {
      mockAuthFetch.mockResolvedValue(makeDevicesResponse([]));
      renderPage();
      const input = screen.getByPlaceholderText('SM-XXXX-XX');
      fireEvent.change(input, { target: { value: 'SM-ABCD-12' } });
      expect(screen.getByText('Activate Device')).not.toBeDisabled();
    });
  });

  // -----------------------------------------------------------------------
  // 5. Successful activation
  // -----------------------------------------------------------------------

  describe('successful activation', () => {
    it('shows success message after activation', async () => {
      let callCount = 0;
      mockAuthFetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve(makeDevicesResponse([]));
        if (callCount === 2) return Promise.resolve(makeActivationResponse());
        return Promise.resolve(makeDevicesResponse([activeDevice]));
      });

      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/No devices connected/)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText('SM-XXXX-XX');
      fireEvent.change(input, { target: { value: 'SM-ABCD-12' } });
      fireEvent.click(screen.getByText('Activate Device'));

      await waitFor(() => {
        expect(screen.getByText(/Device activated successfully/)).toBeInTheDocument();
      });
    });

    it('shows partial device ID in success message', async () => {
      let callCount = 0;
      mockAuthFetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve(makeDevicesResponse([]));
        if (callCount === 2) return Promise.resolve(makeActivationResponse({ device_id: 'abcd1234efgh' }));
        return Promise.resolve(makeDevicesResponse([activeDevice]));
      });

      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/No devices connected/)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText('SM-XXXX-XX'), { target: { value: 'SM-ABCD-12' } });
      fireEvent.click(screen.getByText('Activate Device'));

      await waitFor(() => {
        expect(screen.getByText(/abcd1234\.\.\./)).toBeInTheDocument();
      });
    });

    it('clears activation code input after success', async () => {
      let callCount = 0;
      mockAuthFetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve(makeDevicesResponse([]));
        if (callCount === 2) return Promise.resolve(makeActivationResponse());
        return Promise.resolve(makeDevicesResponse([activeDevice]));
      });

      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/No devices connected/)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText('SM-XXXX-XX');
      fireEvent.change(input, { target: { value: 'SM-ABCD-12' } });
      fireEvent.click(screen.getByText('Activate Device'));

      await waitFor(() => {
        expect(screen.getByText(/Device activated successfully/)).toBeInTheDocument();
      });
      expect(input).toHaveValue('');
    });

    it('reloads devices list after successful activation', async () => {
      let callCount = 0;
      mockAuthFetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve(makeDevicesResponse([]));
        if (callCount === 2) return Promise.resolve(makeActivationResponse());
        return Promise.resolve(makeDevicesResponse([activeDevice]));
      });

      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/No devices connected/)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText('SM-XXXX-XX'), { target: { value: 'SM-ABCD-12' } });
      fireEvent.click(screen.getByText('Activate Device'));

      await waitFor(() => {
        expect(screen.getByText('POS Terminal 1')).toBeInTheDocument();
      });
    });

    it('shows Activating... while activation is in progress', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeDevicesResponse([]))
        .mockReturnValueOnce(new Promise(() => {})); // never resolves

      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/No devices connected/)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText('SM-XXXX-XX'), { target: { value: 'SM-ABCD-12' } });
      fireEvent.click(screen.getByText('Activate Device'));

      await waitFor(() => {
        expect(screen.getByText('Activating...')).toBeInTheDocument();
      });
    });
  });

  // -----------------------------------------------------------------------
  // 6. Activation errors
  // -----------------------------------------------------------------------

  describe('activation errors', () => {
    it('shows CODE_NOT_FOUND error', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeDevicesResponse([]))
        .mockResolvedValueOnce(makeErrorResponse('CODE_NOT_FOUND', 'Not found'));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/No devices connected/)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText('SM-XXXX-XX'), { target: { value: 'SM-ABCD-12' } });
      fireEvent.click(screen.getByText('Activate Device'));

      await waitFor(() => {
        expect(screen.getByText(/Activation code not found/)).toBeInTheDocument();
      });
    });

    it('shows CODE_ALREADY_USED error', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeDevicesResponse([]))
        .mockResolvedValueOnce(makeErrorResponse('CODE_ALREADY_USED', 'Already used'));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/No devices connected/)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText('SM-XXXX-XX'), { target: { value: 'SM-ABCD-12' } });
      fireEvent.click(screen.getByText('Activate Device'));

      await waitFor(() => {
        expect(screen.getByText(/already been used/)).toBeInTheDocument();
      });
    });

    it('shows CODE_EXPIRED error', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeDevicesResponse([]))
        .mockResolvedValueOnce(makeErrorResponse('CODE_EXPIRED', 'Expired'));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/No devices connected/)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText('SM-XXXX-XX'), { target: { value: 'SM-ABCD-12' } });
      fireEvent.click(screen.getByText('Activate Device'));

      await waitFor(() => {
        expect(screen.getByText(/expired/)).toBeInTheDocument();
      });
    });

    it('shows VALIDATION_ERROR with custom message', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeDevicesResponse([]))
        .mockResolvedValueOnce(makeErrorResponse('VALIDATION_ERROR', 'Custom validation msg'));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/No devices connected/)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText('SM-XXXX-XX'), { target: { value: 'SM-ABCD-12' } });
      fireEvent.click(screen.getByText('Activate Device'));

      await waitFor(() => {
        expect(screen.getByText('Custom validation msg')).toBeInTheDocument();
      });
    });

    it('shows default error for unknown error code', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeDevicesResponse([]))
        .mockResolvedValueOnce(makeErrorResponse('UNKNOWN_CODE', 'Something broke'));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/No devices connected/)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText('SM-XXXX-XX'), { target: { value: 'SM-ABCD-12' } });
      fireEvent.click(screen.getByText('Activate Device'));

      await waitFor(() => {
        expect(screen.getByText('Something broke')).toBeInTheDocument();
      });
    });

    it('shows fallback error when no error message', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeDevicesResponse([]))
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ success: false }),
        });

      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/No devices connected/)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText('SM-XXXX-XX'), { target: { value: 'SM-ABCD-12' } });
      fireEvent.click(screen.getByText('Activate Device'));

      await waitFor(() => {
        expect(screen.getByText(/Failed to activate device/)).toBeInTheDocument();
      });
    });

    it('shows network error when activation throws', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeDevicesResponse([]))
        .mockRejectedValueOnce(new Error('Connection refused'));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/No devices connected/)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText('SM-XXXX-XX'), { target: { value: 'SM-ABCD-12' } });
      fireEvent.click(screen.getByText('Activate Device'));

      await waitFor(() => {
        expect(screen.getByText('Connection refused')).toBeInTheDocument();
      });
    });

    it('shows fallback network error when err has no message', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeDevicesResponse([]))
        .mockRejectedValueOnce({ notAnError: true });

      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/No devices connected/)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText('SM-XXXX-XX'), { target: { value: 'SM-ABCD-12' } });
      fireEvent.click(screen.getByText('Activate Device'));

      await waitFor(() => {
        expect(screen.getByText(/Network error/)).toBeInTheDocument();
      });
    });
  });

  // -----------------------------------------------------------------------
  // 7. Input clears error/success
  // -----------------------------------------------------------------------

  describe('input clears messages', () => {
    it('clears error message when typing in code input', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeDevicesResponse([]))
        .mockResolvedValueOnce(makeErrorResponse('CODE_NOT_FOUND', 'Not found'));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/No devices connected/)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText('SM-XXXX-XX'), { target: { value: 'SM-ABCD-12' } });
      fireEvent.click(screen.getByText('Activate Device'));

      await waitFor(() => {
        expect(screen.getByText(/Activation code not found/)).toBeInTheDocument();
      });

      // Type new code — error should clear
      fireEvent.change(screen.getByPlaceholderText('SM-XXXX-XX'), { target: { value: 'SM-XYZW-99' } });
      expect(screen.queryByText(/Activation code not found/)).not.toBeInTheDocument();
    });

    it('clears success message when typing in code input', async () => {
      let callCount = 0;
      mockAuthFetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve(makeDevicesResponse([]));
        if (callCount === 2) return Promise.resolve(makeActivationResponse());
        return Promise.resolve(makeDevicesResponse([activeDevice]));
      });

      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/No devices connected/)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText('SM-XXXX-XX'), { target: { value: 'SM-ABCD-12' } });
      fireEvent.click(screen.getByText('Activate Device'));

      await waitFor(() => {
        expect(screen.getByText(/Device activated successfully/)).toBeInTheDocument();
      });

      // Type new code — success should clear
      fireEvent.change(screen.getByPlaceholderText('SM-XXXX-XX'), { target: { value: 'SM-NEW1-23' } });
      expect(screen.queryByText(/Device activated successfully/)).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // 8. Device load errors
  // -----------------------------------------------------------------------

  describe('device load errors', () => {
    it('shows 401 session expired error', async () => {
      mockAuthFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({}),
      });
      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/Session expired/)).toBeInTheDocument();
      });
    });

    it('shows API error message on non-401 failure', async () => {
      mockAuthFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: { message: 'Database offline' } }),
      });
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Database offline')).toBeInTheDocument();
      });
    });

    it('shows fallback error with status code', async () => {
      mockAuthFetch.mockResolvedValue({
        ok: false,
        status: 503,
        json: () => Promise.resolve({}),
      });
      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/Failed to load devices \(503\)/)).toBeInTheDocument();
      });
    });

    it('shows network error on fetch throw', async () => {
      mockAuthFetch.mockRejectedValue(new Error('Network unreachable'));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/Network error loading devices/)).toBeInTheDocument();
      });
    });

    it('shows timeout error on AbortError', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      mockAuthFetch.mockRejectedValue(abortError);
      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/Request timed out/)).toBeInTheDocument();
      });
    });
  });

  // -----------------------------------------------------------------------
  // 9. Refresh button
  // -----------------------------------------------------------------------

  describe('refresh', () => {
    it('shows Refresh button', async () => {
      mockAuthFetch.mockResolvedValue(makeDevicesResponse([]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Refresh')).toBeInTheDocument();
      });
    });

    it('reloads devices on Refresh click', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeDevicesResponse([]))
        .mockResolvedValueOnce(makeDevicesResponse([activeDevice]));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/No devices connected/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Refresh'));

      await waitFor(() => {
        expect(screen.getByText('POS Terminal 1')).toBeInTheDocument();
      });
    });

    it('shows Loading... on Refresh button while loading', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeDevicesResponse([activeDevice]))
        .mockReturnValueOnce(new Promise(() => {})); // never resolves

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('POS Terminal 1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Refresh'));

      await waitFor(() => {
        expect(screen.getByText('Loading...')).toBeInTheDocument();
      });
    });
  });

  // -----------------------------------------------------------------------
  // 10. Deactivation flow with modal
  // -----------------------------------------------------------------------

  describe('deactivation flow', () => {
    it('opens confirmation modal when clicking Deactivate', async () => {
      mockAuthFetch.mockResolvedValue(makeDevicesResponse([activeDevice]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Deactivate')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Deactivate'));

      expect(screen.getByTestId('modal')).toBeInTheDocument();
      expect(screen.getByText('Deactivate Device')).toBeInTheDocument();
      expect(screen.getByText(/Are you sure you want to deactivate/)).toBeInTheDocument();
      expect(screen.getByText(/re-enrolled/)).toBeInTheDocument();
    });

    it('closes modal on Cancel', async () => {
      mockAuthFetch.mockResolvedValue(makeDevicesResponse([activeDevice]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Deactivate')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Deactivate'));
      expect(screen.getByTestId('modal')).toBeInTheDocument();

      // Click the Cancel button inside the modal
      const cancelButtons = screen.getAllByText('Cancel');
      fireEvent.click(cancelButtons[0]);

      expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
    });

    it('sends PATCH with active=false on confirm', async () => {
      let callCount = 0;
      mockAuthFetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve(makeDevicesResponse([activeDevice]));
        if (callCount === 2) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, device: { ...activeDevice, isActive: false } }),
          });
        }
        return Promise.resolve(makeDevicesResponse([{ ...activeDevice, isActive: false }]));
      });

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Deactivate')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Deactivate'));
      await waitFor(() => {
        expect(screen.getByTestId('modal')).toBeInTheDocument();
      });

      const modalDeactivateBtn = screen.getAllByRole('button', { name: 'Deactivate' });
      await act(async () => {
        fireEvent.click(modalDeactivateBtn[0]);
      });

      await waitFor(() => {
        expect(screen.getByText(/deactivated successfully/)).toBeInTheDocument();
      });

      expect(mockAuthFetch).toHaveBeenCalledWith(
        `/api/v1/retailer-admin/devices/${activeDevice.id}`,
        'test-token',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ active: false }),
        })
      );
    });

    it('shows Processing... while deactivation is in progress', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeDevicesResponse([activeDevice]))
        .mockReturnValueOnce(new Promise(() => {})); // never resolves

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Deactivate')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Deactivate'));
      await waitFor(() => {
        expect(screen.getByTestId('modal')).toBeInTheDocument();
      });

      const modalBtns = screen.getAllByRole('button', { name: 'Deactivate' });
      await act(async () => {
        fireEvent.click(modalBtns[0]);
      });

      await waitFor(() => {
        expect(screen.getByText('Processing...')).toBeInTheDocument();
      });
    });

    it('shows error when deactivation fails', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeDevicesResponse([activeDevice]))
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ error: { message: 'Device is locked by admin' } }),
        });

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Deactivate')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Deactivate'));
      await waitFor(() => {
        expect(screen.getByTestId('modal')).toBeInTheDocument();
      });

      const modalBtns = screen.getAllByRole('button', { name: 'Deactivate' });
      await act(async () => {
        fireEvent.click(modalBtns[0]);
      });

      await waitFor(() => {
        expect(screen.getByText('Device is locked by admin')).toBeInTheDocument();
      });
    });

    it('shows fallback error when deactivation has no error message', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeDevicesResponse([activeDevice]))
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ success: false }),
        });

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Deactivate')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Deactivate'));
      await waitFor(() => {
        expect(screen.getByTestId('modal')).toBeInTheDocument();
      });

      const modalBtns = screen.getAllByRole('button', { name: 'Deactivate' });
      await act(async () => {
        fireEvent.click(modalBtns[0]);
      });

      await waitFor(() => {
        expect(screen.getByText(/Failed to deactivate device/)).toBeInTheDocument();
      });
    });

    it('shows network error when toggle throws', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeDevicesResponse([activeDevice]))
        .mockRejectedValueOnce(new Error('Connection lost'));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Deactivate')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Deactivate'));
      await waitFor(() => {
        expect(screen.getByTestId('modal')).toBeInTheDocument();
      });

      const modalBtns = screen.getAllByRole('button', { name: 'Deactivate' });
      await act(async () => {
        fireEvent.click(modalBtns[0]);
      });

      await waitFor(() => {
        expect(screen.getByText('Connection lost')).toBeInTheDocument();
      });
    });
  });

  // -----------------------------------------------------------------------
  // 11. Reactivation flow
  // -----------------------------------------------------------------------

  describe('reactivation flow', () => {
    it('opens confirmation modal when clicking Reactivate', async () => {
      mockAuthFetch.mockResolvedValue(makeDevicesResponse([revokedDevice]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Reactivate')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Reactivate'));

      expect(screen.getByTestId('modal')).toBeInTheDocument();
      expect(screen.getByText('Reactivate Device')).toBeInTheDocument();
      expect(screen.getByText(/Are you sure you want to reactivate/)).toBeInTheDocument();
    });

    it('sends PATCH with active=true on confirm', async () => {
      let callCount = 0;
      mockAuthFetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve(makeDevicesResponse([revokedDevice]));
        if (callCount === 2) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, device: { ...revokedDevice, isActive: true } }),
          });
        }
        return Promise.resolve(makeDevicesResponse([{ ...revokedDevice, isActive: true }]));
      });

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Reactivate')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Reactivate'));
      await waitFor(() => {
        expect(screen.getByTestId('modal')).toBeInTheDocument();
      });

      const modalBtns = screen.getAllByRole('button', { name: 'Reactivate' });
      await act(async () => {
        fireEvent.click(modalBtns[0]);
      });

      await waitFor(() => {
        expect(screen.getByText(/reactivated successfully/)).toBeInTheDocument();
      });

      expect(mockAuthFetch).toHaveBeenCalledWith(
        `/api/v1/retailer-admin/devices/${revokedDevice.id}`,
        'test-token',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ active: true }),
        })
      );
    });

    it('shows reactivation error from API', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeDevicesResponse([revokedDevice]))
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ error: { message: 'Device limit reached' } }),
        });

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Reactivate')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Reactivate'));
      await waitFor(() => {
        expect(screen.getByTestId('modal')).toBeInTheDocument();
      });

      const modalBtns = screen.getAllByRole('button', { name: 'Reactivate' });
      await act(async () => {
        fireEvent.click(modalBtns[0]);
      });

      await waitFor(() => {
        expect(screen.getByText('Device limit reached')).toBeInTheDocument();
      });
    });

    it('shows fallback network error when reactivation throws non-Error', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeDevicesResponse([revokedDevice]))
        .mockRejectedValueOnce('string error');

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Reactivate')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Reactivate'));
      await waitFor(() => {
        expect(screen.getByTestId('modal')).toBeInTheDocument();
      });

      const modalBtns = screen.getAllByRole('button', { name: 'Reactivate' });
      await act(async () => {
        fireEvent.click(modalBtns[0]);
      });

      await waitFor(() => {
        expect(screen.getByText(/Network error/)).toBeInTheDocument();
      });
    });
  });

  // -----------------------------------------------------------------------
  // 12. Activation button disabled state
  // -----------------------------------------------------------------------

  describe('button disabled states', () => {
    it('disables Activate button while activating', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeDevicesResponse([]))
        .mockReturnValueOnce(new Promise(() => {}));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/No devices connected/)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText('SM-XXXX-XX'), { target: { value: 'SM-ABCD-12' } });
      fireEvent.click(screen.getByText('Activate Device'));

      await waitFor(() => {
        expect(screen.getByText('Activating...')).toBeDisabled();
      });
    });

    it('disables toggle button while Processing', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeDevicesResponse([activeDevice]))
        .mockReturnValueOnce(new Promise(() => {}));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Deactivate')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Deactivate'));
      await waitFor(() => {
        expect(screen.getByTestId('modal')).toBeInTheDocument();
      });

      const modalBtns = screen.getAllByRole('button', { name: 'Deactivate' });
      await act(async () => {
        fireEvent.click(modalBtns[0]);
      });

      await waitFor(() => {
        expect(screen.getByText('Processing...')).toBeDisabled();
      });
    });

    it('disables Refresh button while loading', async () => {
      mockAuthFetch
        .mockResolvedValueOnce(makeDevicesResponse([activeDevice]))
        .mockReturnValueOnce(new Promise(() => {}));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText('POS Terminal 1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Refresh'));

      await waitFor(() => {
        expect(screen.getByText('Loading...')).toBeDisabled();
      });
    });
  });
});
