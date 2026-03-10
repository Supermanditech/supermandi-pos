// SuperAdmin — Test QualityDashboardTab component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QualityDashboardTab } from '../../tabs/QualityDashboardTab';

vi.mock('../../api/quality', () => ({
  fetchQualityOverview: vi.fn(),
  fetchTestResults: vi.fn(),
  resetMetrics: vi.fn(),
}));

vi.mock('../../lib/formatters', () => ({
  formatDateTime: vi.fn((v: string) => v || '--'),
}));

vi.mock('../../components/ConfirmDialog', () => ({
  ConfirmDialog: ({ title, onConfirm, onCancel }: any) => (
    <div data-testid="confirm-dialog">
      <span>{title}</span>
      <button onClick={onConfirm}>Confirm</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  ),
}));

const makeOverview = (overrides: Record<string, unknown> = {}) => ({
  timestamp: '2026-01-01',
  system: { uptime: 86400, memoryMB: 256, totalRequests: 1000, totalErrors: 5, errorRate: '0.5%', avgLatencyMs: 50, p95LatencyMs: 120, activeConnections: 10 },
  database: { status: 'healthy', latencyMs: 5, activeConnections: 8, migrations: 42, latestMigration: '042_add_stuff', tableStats: { stores: 10, devices: 20 } },
  services: [{ name: 'api-gateway', status: 'running', port: 3000, framework: 'express' }],
  tools: {
    vitest: { installed: true, status: 'configured', portals: ['admin'] },
    jest: { installed: true, status: 'configured', specs: 50 },
    playwright: { installed: true, status: 'configured', flows: 10 },
    maestro: { installed: false, status: 'missing' },
    k6: { installed: true, status: 'scripts-ready', scripts: 3 },
    contractTests: { installed: true, status: 'configured', suites: 5 },
    securityScan: { installed: true, status: 'configured', gates: 8 },
    visualRegression: { installed: false, status: 'missing', baselines: 0 },
    databaseTests: { installed: true, status: 'configured' },
  },
  gcp: { project: 'test', region: 'asia-south1', alertPolicies: 3, uptimeChecks: 5, errorReporting: 'enabled', cloudTrace: 'enabled', cloudProfiler: 'enabled' },
  topEndpoints: [{ path: '/api/v1/health', method: 'GET', count: 500, errorCount: 0, totalMs: 5000, maxMs: 50, minMs: 1, p95Ms: 10, lastSeen: '2026-01-01' }],
  gates: { total: 15, categories: { typecheck: 3, unit: 5, integration: 7 } },
  ...overrides,
});

const makeTestResults = (overrides: Record<string, unknown> = {}) => ({
  lastRun: '2026-01-01T12:00:00Z',
  suites: { 'superadmin': { total: 50, passed: 48, failed: 2, skipped: 0, duration: '5.2s' } },
  coverage: { 'superadmin': { statements: 65, branches: 55, functions: 60, lines: 65 } },
  ...overrides,
});

describe('QualityDashboardTab', () => {
  let qualityMock: {
    fetchQualityOverview: ReturnType<typeof vi.fn>;
    fetchTestResults: ReturnType<typeof vi.fn>;
    resetMetrics: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    qualityMock = (await import('../../api/quality')) as any;
  });

  // ── Loading State ───────────────────────────────────────────

  it('shows loading message on initial load', () => {
    qualityMock.fetchQualityOverview.mockReturnValue(new Promise(() => {}));
    qualityMock.fetchTestResults.mockReturnValue(new Promise(() => {}));
    render(<QualityDashboardTab />);
    expect(screen.getByText('Loading quality dashboard...')).toBeTruthy();
  });

  // ── Error State ─────────────────────────────────────────────

  it('shows error state with message', async () => {
    qualityMock.fetchQualityOverview.mockRejectedValue(new Error('Failed to connect'));
    qualityMock.fetchTestResults.mockRejectedValue(new Error('Failed'));
    render(<QualityDashboardTab />);
    await waitFor(() => {
      // R2/R3: Promise.allSettled joins all rejection messages with '; '
      expect(screen.getByText('Failed to connect; Failed')).toBeTruthy();
    });
  });

  it('shows error with role=alert', async () => {
    qualityMock.fetchQualityOverview.mockRejectedValue(new Error('Network error'));
    qualityMock.fetchTestResults.mockRejectedValue(new Error('Network error'));
    render(<QualityDashboardTab />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
  });

  it('shows fallback error for non-Error exceptions', async () => {
    qualityMock.fetchQualityOverview.mockRejectedValue('string error');
    qualityMock.fetchTestResults.mockRejectedValue('string error');
    render(<QualityDashboardTab />);
    await waitFor(() => {
      // R2/R3: Promise.allSettled uses reason?.message || 'Unknown error' per failure
      expect(screen.getByText('Unknown error; Unknown error')).toBeTruthy();
    });
  });

  // ── Header ──────────────────────────────────────────────────

  it('renders Quality Dashboard header', async () => {
    qualityMock.fetchQualityOverview.mockResolvedValue(makeOverview());
    qualityMock.fetchTestResults.mockResolvedValue(makeTestResults());
    render(<QualityDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText('Quality Dashboard')).toBeTruthy();
    });
  });

  it('renders subtitle description', async () => {
    qualityMock.fetchQualityOverview.mockResolvedValue(makeOverview());
    qualityMock.fetchTestResults.mockResolvedValue(makeTestResults());
    render(<QualityDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText(/9 testing tools.*GCP native monitoring/)).toBeTruthy();
    });
  });

  it('renders Refresh button', async () => {
    qualityMock.fetchQualityOverview.mockResolvedValue(makeOverview());
    qualityMock.fetchTestResults.mockResolvedValue(makeTestResults());
    render(<QualityDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeTruthy();
    });
  });

  it('renders Reset Metrics button', async () => {
    qualityMock.fetchQualityOverview.mockResolvedValue(makeOverview());
    qualityMock.fetchTestResults.mockResolvedValue(makeTestResults());
    render(<QualityDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText('Reset Metrics')).toBeTruthy();
    });
  });

  it('renders Auto-refresh checkbox', async () => {
    qualityMock.fetchQualityOverview.mockResolvedValue(makeOverview());
    qualityMock.fetchTestResults.mockResolvedValue(makeTestResults());
    render(<QualityDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText(/Auto-refresh/)).toBeTruthy();
    });
  });

  // ── System Health Banner ────────────────────────────────────

  it('renders uptime metric', async () => {
    qualityMock.fetchQualityOverview.mockResolvedValue(makeOverview());
    qualityMock.fetchTestResults.mockResolvedValue(makeTestResults());
    render(<QualityDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText('Uptime')).toBeTruthy();
      expect(screen.getByText('1d 0h 0m')).toBeTruthy();
    });
  });

  it('renders memory metric', async () => {
    qualityMock.fetchQualityOverview.mockResolvedValue(makeOverview());
    qualityMock.fetchTestResults.mockResolvedValue(makeTestResults());
    render(<QualityDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText('Memory')).toBeTruthy();
      expect(screen.getByText('256 MB')).toBeTruthy();
    });
  });

  it('renders error rate', async () => {
    qualityMock.fetchQualityOverview.mockResolvedValue(makeOverview());
    qualityMock.fetchTestResults.mockResolvedValue(makeTestResults());
    render(<QualityDashboardTab />);
    await waitFor(() => {
      const errorRateLabels = screen.getAllByText('Error Rate');
      expect(errorRateLabels.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('0.5%')).toBeTruthy();
    });
  });

  it('renders P95 latency', async () => {
    qualityMock.fetchQualityOverview.mockResolvedValue(makeOverview());
    qualityMock.fetchTestResults.mockResolvedValue(makeTestResults());
    render(<QualityDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText('P95 Latency')).toBeTruthy();
      expect(screen.getByText('120ms')).toBeTruthy();
    });
  });

  it('renders total requests', async () => {
    qualityMock.fetchQualityOverview.mockResolvedValue(makeOverview());
    qualityMock.fetchTestResults.mockResolvedValue(makeTestResults());
    render(<QualityDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText('Total Requests')).toBeTruthy();
    });
  });

  it('renders avg latency', async () => {
    qualityMock.fetchQualityOverview.mockResolvedValue(makeOverview());
    qualityMock.fetchTestResults.mockResolvedValue(makeTestResults());
    render(<QualityDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText('Avg Latency')).toBeTruthy();
      expect(screen.getByText('50ms')).toBeTruthy();
    });
  });

  // ── Testing Tools ───────────────────────────────────────────

  it('renders Testing Tools section', async () => {
    qualityMock.fetchQualityOverview.mockResolvedValue(makeOverview());
    qualityMock.fetchTestResults.mockResolvedValue(makeTestResults());
    render(<QualityDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText('Testing Tools')).toBeTruthy();
    });
  });

  it('renders Vitest tool card', async () => {
    qualityMock.fetchQualityOverview.mockResolvedValue(makeOverview());
    qualityMock.fetchTestResults.mockResolvedValue(makeTestResults());
    render(<QualityDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText('Vitest')).toBeTruthy();
      expect(screen.getByText('1 portals')).toBeTruthy();
    });
  });

  it('renders Jest tool card', async () => {
    qualityMock.fetchQualityOverview.mockResolvedValue(makeOverview());
    qualityMock.fetchTestResults.mockResolvedValue(makeTestResults());
    render(<QualityDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText('Jest')).toBeTruthy();
      expect(screen.getByText('50 specs')).toBeTruthy();
    });
  });

  it('renders Playwright tool card', async () => {
    qualityMock.fetchQualityOverview.mockResolvedValue(makeOverview());
    qualityMock.fetchTestResults.mockResolvedValue(makeTestResults());
    render(<QualityDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText('Playwright E2E')).toBeTruthy();
      expect(screen.getByText('10 flows')).toBeTruthy();
    });
  });

  it('shows Missing for uninstalled tools', async () => {
    qualityMock.fetchQualityOverview.mockResolvedValue(makeOverview());
    qualityMock.fetchTestResults.mockResolvedValue(makeTestResults());
    render(<QualityDashboardTab />);
    await waitFor(() => {
      const missingElements = screen.getAllByText('Missing');
      expect(missingElements.length).toBeGreaterThanOrEqual(2); // Maestro + Visual Regression
    });
  });

  it('shows Installed for installed tools', async () => {
    qualityMock.fetchQualityOverview.mockResolvedValue(makeOverview());
    qualityMock.fetchTestResults.mockResolvedValue(makeTestResults());
    render(<QualityDashboardTab />);
    await waitFor(() => {
      const installedElements = screen.getAllByText('Installed');
      expect(installedElements.length).toBeGreaterThanOrEqual(7); // All installed tools
    });
  });

  // ── GCP Native Tools ───────────────────────────────────────

  it('renders GCP Native Tools section', async () => {
    qualityMock.fetchQualityOverview.mockResolvedValue(makeOverview());
    qualityMock.fetchTestResults.mockResolvedValue(makeTestResults());
    render(<QualityDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText('GCP Native Tools')).toBeTruthy();
    });
  });

  // ── Database Health ─────────────────────────────────────────

  it('renders Database Health section', async () => {
    qualityMock.fetchQualityOverview.mockResolvedValue(makeOverview());
    qualityMock.fetchTestResults.mockResolvedValue(makeTestResults());
    render(<QualityDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText('Database Health')).toBeTruthy();
    });
  });

  // ── Test Results ────────────────────────────────────────────

  it('renders Test Results section', async () => {
    qualityMock.fetchQualityOverview.mockResolvedValue(makeOverview());
    qualityMock.fetchTestResults.mockResolvedValue(makeTestResults());
    render(<QualityDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText('Test Results')).toBeTruthy();
    });
  });

  it('renders suite name in test results', async () => {
    qualityMock.fetchQualityOverview.mockResolvedValue(makeOverview());
    qualityMock.fetchTestResults.mockResolvedValue(makeTestResults());
    render(<QualityDashboardTab />);
    await waitFor(() => {
      const superadminElements = screen.getAllByText('superadmin');
      expect(superadminElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Code Coverage ───────────────────────────────────────────

  it('renders Code Coverage section', async () => {
    qualityMock.fetchQualityOverview.mockResolvedValue(makeOverview());
    qualityMock.fetchTestResults.mockResolvedValue(makeTestResults());
    render(<QualityDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText('Code Coverage')).toBeTruthy();
    });
  });

  // ── Reset Metrics ───────────────────────────────────────────

  it('shows confirm dialog on Reset Metrics click', async () => {
    qualityMock.fetchQualityOverview.mockResolvedValue(makeOverview());
    qualityMock.fetchTestResults.mockResolvedValue(makeTestResults());
    render(<QualityDashboardTab />);
    await waitFor(() => expect(screen.getByText('Reset Metrics')).toBeTruthy());
    fireEvent.click(screen.getByText('Reset Metrics'));
    expect(screen.getByTestId('confirm-dialog')).toBeTruthy();
  });
});
