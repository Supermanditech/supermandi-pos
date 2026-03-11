// SuperAdmin — Test HealthDashboardTab component (SA-P1-009)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { HealthDashboardTab } from '../../tabs/HealthDashboardTab';

const mockFetchStoreHealth = vi.fn();

vi.mock('../../api/health', () => ({
  fetchStoreHealth: () => mockFetchStoreHealth(),
}));

const makeMockResponse = (overrides: Record<string, unknown> = {}) => ({
  summary: {
    totalStores: 3,
    healthyCount: 1,
    warningCount: 1,
    criticalCount: 1,
  },
  stores: [
    {
      id: 'store-1',
      name: 'Critical Store',
      code: 'SU-001',
      status: 'ACTIVE',
      healthScore: 25,
      factors: [
        { name: 'Device', status: 'critical', detail: 'No device bound' },
        { name: 'Sync', status: 'critical', detail: 'Never synced' },
        { name: 'Orders', status: 'healthy', detail: '5 orders in 7d' },
        { name: 'KYC', status: 'critical', detail: 'Status: incomplete' },
      ],
    },
    {
      id: 'store-2',
      name: 'Warning Store',
      code: 'SU-002',
      status: 'ACTIVE',
      healthScore: 50,
      factors: [
        { name: 'Device', status: 'healthy', detail: '1 active device(s)' },
        { name: 'Sync', status: 'warning', detail: 'Last sync 3d ago' },
        { name: 'Orders', status: 'healthy', detail: '2 orders in 7d' },
        { name: 'KYC', status: 'critical', detail: 'Status: incomplete' },
      ],
    },
    {
      id: 'store-3',
      name: 'Healthy Store',
      code: 'SU-003',
      status: 'ACTIVE',
      healthScore: 100,
      factors: [
        { name: 'Device', status: 'healthy', detail: '1 active device(s)' },
        { name: 'Sync', status: 'healthy', detail: 'Last sync 2h ago' },
        { name: 'Orders', status: 'healthy', detail: '10 orders in 7d' },
        { name: 'KYC', status: 'healthy', detail: 'Complete & approved' },
      ],
    },
  ],
  ...overrides,
});

describe('HealthDashboardTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Loading State ───────────────────────────────────────────

  it('shows loading message on initial load', () => {
    mockFetchStoreHealth.mockReturnValue(new Promise(() => {}));
    render(<HealthDashboardTab />);
    expect(screen.getByText('Loading store health dashboard...')).toBeTruthy();
  });

  // ── Error State ─────────────────────────────────────────────

  it('shows error state with message', async () => {
    mockFetchStoreHealth.mockRejectedValue(new Error('Failed to connect'));
    render(<HealthDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText('Failed to connect')).toBeTruthy();
    });
  });

  it('shows error with role=alert', async () => {
    mockFetchStoreHealth.mockRejectedValue(new Error('Network error'));
    render(<HealthDashboardTab />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
  });

  it('shows fallback error for non-Error exceptions', async () => {
    mockFetchStoreHealth.mockRejectedValue('string error');
    render(<HealthDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText('Failed to load store health data')).toBeTruthy();
    });
  });

  // ── Header ──────────────────────────────────────────────────

  it('renders header', async () => {
    mockFetchStoreHealth.mockResolvedValue(makeMockResponse());
    render(<HealthDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText('Store Health Dashboard')).toBeTruthy();
    });
  });

  it('renders subtitle description', async () => {
    mockFetchStoreHealth.mockResolvedValue(makeMockResponse());
    render(<HealthDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText(/Per-store health scoring/)).toBeTruthy();
    });
  });

  // ── Summary Cards ───────────────────────────────────────────

  it('displays total stores count', async () => {
    mockFetchStoreHealth.mockResolvedValue(makeMockResponse());
    render(<HealthDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText('Total Stores')).toBeTruthy();
      expect(screen.getByText('3')).toBeTruthy();
    });
  });

  it('displays healthy count', async () => {
    mockFetchStoreHealth.mockResolvedValue(makeMockResponse());
    render(<HealthDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText('Healthy (80+)')).toBeTruthy();
    });
  });

  it('displays warning count', async () => {
    mockFetchStoreHealth.mockResolvedValue(makeMockResponse());
    render(<HealthDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText('Warning (50-79)')).toBeTruthy();
    });
  });

  it('displays critical count', async () => {
    mockFetchStoreHealth.mockResolvedValue(makeMockResponse());
    render(<HealthDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText('Critical (<50)')).toBeTruthy();
    });
  });

  // ── Store Table ─────────────────────────────────────────────

  it('renders store names in table', async () => {
    mockFetchStoreHealth.mockResolvedValue(makeMockResponse());
    render(<HealthDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText('Critical Store')).toBeTruthy();
      expect(screen.getByText('Warning Store')).toBeTruthy();
      expect(screen.getByText('Healthy Store')).toBeTruthy();
    });
  });

  it('renders store codes in table', async () => {
    mockFetchStoreHealth.mockResolvedValue(makeMockResponse());
    render(<HealthDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText('SU-001')).toBeTruthy();
      expect(screen.getByText('SU-002')).toBeTruthy();
      expect(screen.getByText('SU-003')).toBeTruthy();
    });
  });

  it('renders health score values', async () => {
    mockFetchStoreHealth.mockResolvedValue(makeMockResponse());
    render(<HealthDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText('25')).toBeTruthy();
      expect(screen.getByText('50')).toBeTruthy();
      expect(screen.getByText('100')).toBeTruthy();
    });
  });

  it('renders health score bars with correct widths', async () => {
    mockFetchStoreHealth.mockResolvedValue(makeMockResponse());
    render(<HealthDashboardTab />);
    await waitFor(() => {
      const bar1 = screen.getByTestId('health-bar-store-1');
      expect(bar1.style.width).toBe('25%');
      const bar3 = screen.getByTestId('health-bar-store-3');
      expect(bar3.style.width).toBe('100%');
    });
  });

  it('renders factor badges', async () => {
    mockFetchStoreHealth.mockResolvedValue(makeMockResponse());
    render(<HealthDashboardTab />);
    await waitFor(() => {
      expect(screen.getAllByText(/Device: (healthy|warning|critical)/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Sync: (healthy|warning|critical)/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Orders: (healthy|warning|critical)/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/KYC: (healthy|warning|critical)/).length).toBeGreaterThan(0);
    });
  });

  it('renders table headers', async () => {
    mockFetchStoreHealth.mockResolvedValue(makeMockResponse());
    render(<HealthDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText('Store')).toBeTruthy();
      expect(screen.getByText('Code')).toBeTruthy();
      expect(screen.getByText('Health Score')).toBeTruthy();
      expect(screen.getByText('Device')).toBeTruthy();
      expect(screen.getByText('Sync')).toBeTruthy();
      expect(screen.getByText('Orders')).toBeTruthy();
      expect(screen.getByText('KYC')).toBeTruthy();
    });
  });

  // ── Empty State ─────────────────────────────────────────────

  it('shows empty state when no stores', async () => {
    mockFetchStoreHealth.mockResolvedValue({
      summary: { totalStores: 0, healthyCount: 0, warningCount: 0, criticalCount: 0 },
      stores: [],
    });
    render(<HealthDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText('No stores found.')).toBeTruthy();
    });
  });

  it('does not show empty state when stores exist', async () => {
    mockFetchStoreHealth.mockResolvedValue(makeMockResponse());
    render(<HealthDashboardTab />);
    await waitFor(() => {
      expect(screen.queryByText('No stores found.')).toBeNull();
    });
  });

  // ── Auto-Refresh ────────────────────────────────────────────

  it('renders auto-refresh checkbox (checked by default)', async () => {
    mockFetchStoreHealth.mockResolvedValue(makeMockResponse());
    render(<HealthDashboardTab />);
    await waitFor(() => {
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeTruthy();
      expect((checkbox as HTMLInputElement).checked).toBe(true);
    });
  });

  it('auto-refresh checkbox can be toggled', async () => {
    mockFetchStoreHealth.mockResolvedValue(makeMockResponse());
    render(<HealthDashboardTab />);
    await waitFor(() => {
      const checkbox = screen.getByRole('checkbox');
      expect((checkbox as HTMLInputElement).checked).toBe(true);
    });
    fireEvent.click(screen.getByRole('checkbox'));
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
  });

  // ── Refresh Button ──────────────────────────────────────────

  it('renders refresh button', async () => {
    mockFetchStoreHealth.mockResolvedValue(makeMockResponse());
    render(<HealthDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeTruthy();
    });
  });

  it('clicking refresh reloads data', async () => {
    mockFetchStoreHealth.mockResolvedValue(makeMockResponse());
    render(<HealthDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeTruthy();
    });
    // First call from mount
    expect(mockFetchStoreHealth).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Refresh'));
    await waitFor(() => {
      expect(mockFetchStoreHealth).toHaveBeenCalledTimes(2);
    });
  });

  // ── Factor Badge Details ────────────────────────────────────

  it('factor badges have title attribute with detail', async () => {
    mockFetchStoreHealth.mockResolvedValue(makeMockResponse());
    render(<HealthDashboardTab />);
    await waitFor(() => {
      const badges = screen.getAllByText(/Device: critical/);
      expect(badges.length).toBeGreaterThan(0);
      expect(badges[0].getAttribute('title')).toBe('No device bound');
    });
  });
});
