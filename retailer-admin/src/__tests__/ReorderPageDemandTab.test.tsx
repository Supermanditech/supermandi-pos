/**
 * V3-HARDEN-185: Mounted route-level test proving demand signals tab
 * renders within the live ReorderPage route.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ReorderPage from '../pages/ReorderPage';

let mockAccessToken: string | null = 'test-token';

vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({ accessToken: mockAccessToken }),
}));

vi.mock('../components/Breadcrumb', () => ({
  default: ({ items }: { items: { label: string }[] }) => (
    <nav data-testid="breadcrumb">{items.map((item, i) => <span key={i}>{item.label}</span>)}</nav>
  ),
}));

vi.mock('../components/EmptyState', () => ({
  default: ({ title }: { title: string }) => <div data-testid="empty-state">{title}</div>,
}));

vi.mock('lucide-react', () => ({
  PackageCheck: () => <span>PackageCheckIcon</span>,
  RefreshCw: ({ className }: { className?: string }) => <span className={className}>RefreshIcon</span>,
  Settings: () => <span>SettingsIcon</span>,
  AlertTriangle: () => <span>AlertIcon</span>,
}));

const mockAuthFetch = vi.fn();
vi.mock('../lib/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
  safeJson: (res: { json: () => Promise<unknown> }) => res.json(),
}));

// Mock DemandSignalsSection to prove it mounts
vi.mock('../components/DemandSignalsSection', () => ({
  DemandSignalsSection: () => <div data-testid="demand-signals-section">Demand Signals Loaded</div>,
}));

function makeResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/s/store-1/reorder']}>
      <Routes>
        <Route path="/s/:storeCode/reorder" element={<ReorderPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockAccessToken = 'test-token';
  mockAuthFetch.mockReset();
  // Return appropriate data based on URL
  mockAuthFetch.mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/reorder/settings')) {
      return Promise.resolve(makeResponse({ data: { reorderEnabled: true, requireApproval: false, notifyOnLowStock: true, autoApproveThreshold: null, defaultLeadDays: 3, updatedAt: null, storeId: 'store-1' } }));
    }
    if (typeof url === 'string' && url.includes('/reorder/suggestions')) {
      return Promise.resolve(makeResponse({ data: [] }));
    }
    if (typeof url === 'string' && url.includes('/reorder/pending')) {
      return Promise.resolve(makeResponse({ data: [], pagination: { total: 0, limit: 20, offset: 0 } }));
    }
    return Promise.resolve(makeResponse({ data: {} }));
  });
});

describe('ReorderPage demand-signals tab integration', () => {
  it('renders Demand Signals tab button', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Demand Signals' })).toBeInTheDocument();
    });
  });

  it('clicking Demand Signals tab mounts DemandSignalsSection', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Demand Signals' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Demand Signals' }));

    await waitFor(() => {
      expect(screen.getByTestId('demand-signals-section')).toBeInTheDocument();
      expect(screen.getByText('Demand Signals Loaded')).toBeInTheDocument();
    });
  });

  it('demand-signals tab is aria-selected when active', async () => {
    renderPage();
    await waitFor(() => {
      const tab = screen.getByRole('tab', { name: 'Demand Signals' });
      expect(tab).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Demand Signals' }));

    const tab = screen.getByRole('tab', { name: 'Demand Signals' });
    expect(tab).toHaveAttribute('aria-selected', 'true');
  });
});
