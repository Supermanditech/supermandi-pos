import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DeviceRequiredBanner from '../components/DeviceRequiredBanner';

// Mock AuthContext
vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({
    accessToken: 'test-token',
    isAuthenticated: true,
    store: { id: 'store-1', name: 'Test Store', code: 'TEST' },
  }),
}));

// Mock api
const mockAuthFetch = vi.fn();
vi.mock('../lib/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
  safeJson: (res: Response) => res.json(),
}));

describe('DeviceRequiredBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderInRoute = (onStatusLoaded?: (has: boolean) => void) =>
    render(
      <MemoryRouter initialEntries={['/s/TEST/dashboard']}>
        <Routes>
          <Route path="/s/:storeCode/*" element={<DeviceRequiredBanner onStatusLoaded={onStatusLoaded} />} />
        </Routes>
      </MemoryRouter>
    );

  it('shows nothing while loading', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {})); // never resolves
    const { container } = renderInRoute();
    // While loading, returns null
    expect(container.innerHTML).toBe('');
  });

  it('shows nothing when devices exist', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ devices: [{ id: 'd1' }] }),
    });
    const { container } = renderInRoute();
    await waitFor(() => {
      expect(container.innerHTML).toBe('');
    });
  });

  it('shows banner when no devices exist', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ devices: [] }),
    });
    renderInRoute();
    await waitFor(() => {
      expect(screen.getByText('Activate Your POS')).toBeInTheDocument();
    });
    expect(screen.getByText(/Download the SuperMandi POS app/)).toBeInTheDocument();
    expect(screen.getByText('Activate Device')).toBeInTheDocument();
  });

  it('calls onStatusLoaded with false when no devices', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ devices: [] }),
    });
    const onStatusLoaded = vi.fn();
    renderInRoute(onStatusLoaded);
    await waitFor(() => {
      expect(onStatusLoaded).toHaveBeenCalledWith(false);
    });
  });

  it('calls onStatusLoaded with true when devices exist', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ devices: [{ id: 'd1' }] }),
    });
    const onStatusLoaded = vi.fn();
    renderInRoute(onStatusLoaded);
    await waitFor(() => {
      expect(onStatusLoaded).toHaveBeenCalledWith(true);
    });
  });

  it('dismisses banner when close button is clicked', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ devices: [] }),
    });
    renderInRoute();
    await waitFor(() => {
      expect(screen.getByText('Activate Your POS')).toBeInTheDocument();
    });
    const closeBtn = screen.getByTitle(/Dismiss/);
    fireEvent.click(closeBtn);
    expect(screen.queryByText('Activate Your POS')).not.toBeInTheDocument();
  });

  it('hides banner on API error (no false positives)', async () => {
    mockAuthFetch.mockRejectedValue(new Error('Network error'));
    const { container } = renderInRoute();
    await waitFor(() => {
      expect(container.innerHTML).toBe('');
    });
  });

  it('has activate device link pointing to devices page', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ devices: [] }),
    });
    renderInRoute();
    await waitFor(() => {
      const link = screen.getByText('Activate Device');
      expect(link).toHaveAttribute('href', '/s/TEST/devices');
    });
  });
});
