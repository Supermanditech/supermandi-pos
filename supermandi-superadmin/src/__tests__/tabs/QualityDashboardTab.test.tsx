// SuperAdmin — Test QualityDashboardTab component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QualityDashboardTab } from '../../tabs/QualityDashboardTab';

vi.mock('../../api/quality', () => ({
  fetchQualityOverview: vi.fn(),
  fetchTestResults: vi.fn(),
  resetMetrics: vi.fn(),
}));

const makeOverview = () => ({
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
});

const makeTestResults = () => ({
  lastRun: '2026-01-01T12:00:00Z',
  suites: { 'superadmin': { total: 50, passed: 48, failed: 2, skipped: 0, duration: '5.2s' } },
  coverage: { 'superadmin': { statements: 65, branches: 55, functions: 60, lines: 65 } },
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

  it('shows loading state', () => {
    qualityMock.fetchQualityOverview.mockReturnValue(new Promise(() => {}));
    qualityMock.fetchTestResults.mockReturnValue(new Promise(() => {}));
    render(<QualityDashboardTab />);
    expect(screen.getByText('Loading quality dashboard...')).toBeTruthy();
  });

  it('shows error state', async () => {
    qualityMock.fetchQualityOverview.mockRejectedValue(new Error('Failed'));
    qualityMock.fetchTestResults.mockRejectedValue(new Error('Failed'));
    render(<QualityDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeTruthy();
    });
  });

  it('renders dashboard with overview data', async () => {
    qualityMock.fetchQualityOverview.mockResolvedValue(makeOverview());
    qualityMock.fetchTestResults.mockResolvedValue(makeTestResults());
    render(<QualityDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText('Quality Dashboard')).toBeTruthy();
      expect(screen.getByText('Testing Tools')).toBeTruthy();
      expect(screen.getByText('GCP Native Tools')).toBeTruthy();
    });
  });

  it('renders system health metrics', async () => {
    qualityMock.fetchQualityOverview.mockResolvedValue(makeOverview());
    qualityMock.fetchTestResults.mockResolvedValue(makeTestResults());
    render(<QualityDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText('Quality Dashboard')).toBeTruthy();
    });
    // After dashboard loads, check health metrics (some labels appear in multiple places)
    expect(screen.getAllByText('Error Rate').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('0.5%')).toBeTruthy();
    expect(screen.getByText('Memory')).toBeTruthy();
  });

  it('renders test results table', async () => {
    qualityMock.fetchQualityOverview.mockResolvedValue(makeOverview());
    qualityMock.fetchTestResults.mockResolvedValue(makeTestResults());
    render(<QualityDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText('Quality Dashboard')).toBeTruthy();
    });
    // After dashboard loads, check test results (superadmin appears in both suites and coverage)
    expect(screen.getByText('Test Results')).toBeTruthy();
    expect(screen.getAllByText('superadmin').length).toBeGreaterThanOrEqual(1);
  });

  it('renders code coverage table', async () => {
    qualityMock.fetchQualityOverview.mockResolvedValue(makeOverview());
    qualityMock.fetchTestResults.mockResolvedValue(makeTestResults());
    render(<QualityDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText('Code Coverage')).toBeTruthy();
    });
  });

  it('renders database health section', async () => {
    qualityMock.fetchQualityOverview.mockResolvedValue(makeOverview());
    qualityMock.fetchTestResults.mockResolvedValue(makeTestResults());
    render(<QualityDashboardTab />);
    await waitFor(() => {
      expect(screen.getByText('Database Health')).toBeTruthy();
    });
  });
});
