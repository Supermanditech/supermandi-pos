import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DeviceActivationPage from '../pages/DeviceActivationPage';

vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({
    accessToken: 'test-token',
    store: { id: 's1', name: 'Test Store', code: 'TEST' },
  }),
}));

vi.mock('../components/Breadcrumb', () => ({
  default: () => <nav data-testid="breadcrumb">Breadcrumb</nav>,
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

describe('DeviceActivationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('renders page header and activation form', () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ devices: [] }),
    });
    renderPage();
    expect(screen.getByText('Device Activation')).toBeInTheDocument();
    expect(screen.getByText('Activate New Device')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('SM-XXXX-XX')).toBeInTheDocument();
  });

  it('shows instructions', () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ devices: [] }),
    });
    renderPage();
    expect(screen.getByText('How to get an activation code:')).toBeInTheDocument();
  });

  it('shows no devices message when empty', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ devices: [] }),
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/No devices connected/)).toBeInTheDocument();
    });
  });

  it('renders connected devices', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        devices: [
          { id: 'dev-1234-abcd', label: 'POS Terminal 1', deviceType: 'android', isActive: true, createdAt: '2026-01-01', manufacturer: 'Samsung', model: 'A14' },
        ],
      }),
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('POS Terminal 1')).toBeInTheDocument();
      expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    });
  });

  it('disables activate button for invalid code', () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ devices: [] }),
    });
    renderPage();
    const activateBtn = screen.getByText('Activate Device');
    expect(activateBtn).toBeDisabled();
  });

  it('formats activation code as user types', () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ devices: [] }),
    });
    renderPage();
    const input = screen.getByPlaceholderText('SM-XXXX-XX');
    fireEvent.change(input, { target: { value: 'ABC123' } });
    expect(input).toHaveValue('SM-ABC1-23');
  });

  it('shows error on activation failure', async () => {
    // First call returns devices list, second is activation
    let callCount = 0;
    mockAuthFetch.mockImplementation(() => {
      callCount++;
      if (callCount <= 1) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ devices: [] }) });
      }
      return Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ error: { code: 'CODE_NOT_FOUND', message: 'Not found' } }),
      });
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/No devices connected/)).toBeInTheDocument();
    });
    const input = screen.getByPlaceholderText('SM-XXXX-XX');
    fireEvent.change(input, { target: { value: 'SM-ABCD-12' } });
    fireEvent.click(screen.getByText('Activate Device'));
    await waitFor(() => {
      expect(screen.getByText(/Activation code not found/)).toBeInTheDocument();
    });
  });

  it('renders breadcrumb', () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ devices: [] }),
    });
    renderPage();
    expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
  });
});
