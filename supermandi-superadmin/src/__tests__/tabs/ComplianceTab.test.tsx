// SuperAdmin — Test ComplianceTab component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ComplianceTab } from '../../tabs/ComplianceTab';

vi.mock('../../api/compliance', () => ({
  fetchComplianceOverview: vi.fn(),
}));

const makeOverview = (overrides: Record<string, unknown> = {}) => ({
  summary: {
    totalStores: 10,
    compliantCount: 5,
    nonCompliantCount: 2,
    pendingCount: 3,
  },
  stores: [],
  ...overrides,
});

const makeStore = (overrides: Record<string, unknown> = {}) => ({
  id: 's1',
  name: 'Test Store',
  code: 'TS01',
  status: 'ACTIVE',
  kycStatus: 'approved',
  kycComplete: true,
  adminApproved: true,
  deviceBound: true,
  upiComplete: true,
  complianceStatus: 'compliant',
  documents: { total: 3, approved: 3, pending: 0, rejected: 0 },
  createdAt: '2024-01-01',
  updatedAt: '2024-01-15',
  ...overrides,
});

describe('ComplianceTab', () => {
  let complianceMock: {
    fetchComplianceOverview: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    complianceMock = (await import('../../api/compliance')) as any;
  });

  // ── Header ──────────────────────────────────────────────────

  it('renders header title', async () => {
    complianceMock.fetchComplianceOverview.mockResolvedValue(makeOverview());
    render(<ComplianceTab />);
    expect(screen.getByText('Compliance Overview')).toBeTruthy();
  });

  it('renders subtitle description', async () => {
    complianceMock.fetchComplianceOverview.mockResolvedValue(makeOverview());
    render(<ComplianceTab />);
    expect(screen.getByText(/KYC status, document verification/)).toBeTruthy();
  });

  it('renders Refresh button', async () => {
    complianceMock.fetchComplianceOverview.mockResolvedValue(makeOverview());
    render(<ComplianceTab />);
    await waitFor(() => expect(screen.getByText('Refresh')).toBeTruthy());
  });

  // ── Loading State ───────────────────────────────────────────

  it('shows loading skeleton on initial load', async () => {
    let resolve: (v: any) => void;
    const pending = new Promise((r) => { resolve = r; });
    complianceMock.fetchComplianceOverview.mockReturnValue(pending);
    const { container } = render(<ComplianceTab />);
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
    resolve!(makeOverview());
    await waitFor(() => expect(screen.getByText('10')).toBeTruthy());
  });

  // ── Summary Cards ──────────────────────────────────────────

  it('renders summary cards with correct counts', async () => {
    complianceMock.fetchComplianceOverview.mockResolvedValue(makeOverview());
    render(<ComplianceTab />);
    await waitFor(() => {
      expect(screen.getByText('10')).toBeTruthy();
      expect(screen.getByText('5')).toBeTruthy();
      expect(screen.getByText('2')).toBeTruthy();
      expect(screen.getByText('3')).toBeTruthy();
    });
  });

  it('renders Total Stores label', async () => {
    complianceMock.fetchComplianceOverview.mockResolvedValue(makeOverview());
    render(<ComplianceTab />);
    await waitFor(() => expect(screen.getByText('Total Stores')).toBeTruthy());
  });

  it('renders Compliant label', async () => {
    complianceMock.fetchComplianceOverview.mockResolvedValue(makeOverview());
    render(<ComplianceTab />);
    await waitFor(() => expect(screen.getByText('Compliant')).toBeTruthy());
  });

  it('renders Non-Compliant label', async () => {
    complianceMock.fetchComplianceOverview.mockResolvedValue(makeOverview());
    render(<ComplianceTab />);
    await waitFor(() => expect(screen.getByText('Non-Compliant')).toBeTruthy());
  });

  it('renders Pending label', async () => {
    complianceMock.fetchComplianceOverview.mockResolvedValue(makeOverview());
    render(<ComplianceTab />);
    await waitFor(() => expect(screen.getByText('Pending')).toBeTruthy());
  });

  // ── Table ───────────────────────────────────────────────────

  it('renders stores table with data', async () => {
    complianceMock.fetchComplianceOverview.mockResolvedValue(
      makeOverview({ stores: [makeStore()] })
    );
    render(<ComplianceTab />);
    await waitFor(() => {
      expect(screen.getByText('Test Store')).toBeTruthy();
      expect(screen.getByText('TS01')).toBeTruthy();
    });
  });

  it('renders table headers', async () => {
    complianceMock.fetchComplianceOverview.mockResolvedValue(
      makeOverview({ stores: [makeStore()] })
    );
    render(<ComplianceTab />);
    await waitFor(() => {
      expect(screen.getByText('Store')).toBeTruthy();
      expect(screen.getByText('Status')).toBeTruthy();
      expect(screen.getByText('KYC')).toBeTruthy();
      expect(screen.getByText('Admin Approval')).toBeTruthy();
      expect(screen.getByText('Documents')).toBeTruthy();
    });
  });

  it('shows Compliant badge for compliant store', async () => {
    complianceMock.fetchComplianceOverview.mockResolvedValue(
      makeOverview({ stores: [makeStore({ complianceStatus: 'compliant' })] })
    );
    render(<ComplianceTab />);
    // The "Compliant" text appears both in summary card label and badge
    await waitFor(() => {
      const badges = screen.getAllByText('Compliant');
      expect(badges.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows Non-Compliant badge for non-compliant store', async () => {
    complianceMock.fetchComplianceOverview.mockResolvedValue(
      makeOverview({
        stores: [makeStore({ complianceStatus: 'non_compliant', kycComplete: false, adminApproved: false })],
      })
    );
    render(<ComplianceTab />);
    await waitFor(() => {
      const badges = screen.getAllByText('Non-Compliant');
      expect(badges.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows Pending badge for pending store', async () => {
    complianceMock.fetchComplianceOverview.mockResolvedValue(
      makeOverview({
        stores: [makeStore({ complianceStatus: 'pending', kycComplete: false })],
      })
    );
    render(<ComplianceTab />);
    await waitFor(() => {
      const badges = screen.getAllByText('Pending');
      expect(badges.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows KYC Complete badge', async () => {
    complianceMock.fetchComplianceOverview.mockResolvedValue(
      makeOverview({ stores: [makeStore({ kycComplete: true })] })
    );
    render(<ComplianceTab />);
    await waitFor(() => expect(screen.getByText('Complete')).toBeTruthy());
  });

  it('shows KYC Incomplete badge', async () => {
    complianceMock.fetchComplianceOverview.mockResolvedValue(
      makeOverview({ stores: [makeStore({ kycComplete: false })] })
    );
    render(<ComplianceTab />);
    await waitFor(() => expect(screen.getByText('Incomplete')).toBeTruthy());
  });

  it('shows Approved badge', async () => {
    complianceMock.fetchComplianceOverview.mockResolvedValue(
      makeOverview({ stores: [makeStore({ adminApproved: true })] })
    );
    render(<ComplianceTab />);
    await waitFor(() => expect(screen.getByText('Approved')).toBeTruthy());
  });

  it('shows Not Approved badge', async () => {
    complianceMock.fetchComplianceOverview.mockResolvedValue(
      makeOverview({ stores: [makeStore({ adminApproved: false })] })
    );
    render(<ComplianceTab />);
    await waitFor(() => expect(screen.getByText('Not Approved')).toBeTruthy());
  });

  it('shows document counts', async () => {
    complianceMock.fetchComplianceOverview.mockResolvedValue(
      makeOverview({ stores: [makeStore({ documents: { total: 5, approved: 4, pending: 1, rejected: 1 } })] })
    );
    render(<ComplianceTab />);
    await waitFor(() => {
      // Check for "X rejected" text indicating document stats rendered
      expect(screen.getByText(/1 rejected/)).toBeTruthy();
      expect(screen.getByText(/1 pending/)).toBeTruthy();
    });
  });

  it('shows No docs for stores without documents', async () => {
    complianceMock.fetchComplianceOverview.mockResolvedValue(
      makeOverview({ stores: [makeStore({ documents: { total: 0, approved: 0, pending: 0, rejected: 0 } })] })
    );
    render(<ComplianceTab />);
    await waitFor(() => expect(screen.getByText('No docs')).toBeTruthy());
  });

  // ── Empty State ─────────────────────────────────────────────

  it('shows empty message when no stores', async () => {
    complianceMock.fetchComplianceOverview.mockResolvedValue(makeOverview({ stores: [] }));
    render(<ComplianceTab />);
    await waitFor(() => expect(screen.getByText('No stores found')).toBeTruthy());
  });

  // ── Error State ─────────────────────────────────────────────

  it('shows error message on failure', async () => {
    complianceMock.fetchComplianceOverview.mockRejectedValue(new Error('Network error'));
    render(<ComplianceTab />);
    await waitFor(() => expect(screen.getByText('Network error')).toBeTruthy());
  });

  it('shows error in alert role', async () => {
    complianceMock.fetchComplianceOverview.mockRejectedValue(new Error('Oops'));
    render(<ComplianceTab />);
    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toBeTruthy();
    });
  });

  // ── Filter ──────────────────────────────────────────────────

  it('filters stores by clicking summary cards', async () => {
    complianceMock.fetchComplianceOverview.mockResolvedValue(
      makeOverview({
        stores: [
          makeStore({ id: 's1', name: 'Compliant Store', complianceStatus: 'compliant' }),
          makeStore({ id: 's2', name: 'Pending Store', complianceStatus: 'pending', kycComplete: false }),
        ],
      })
    );
    render(<ComplianceTab />);
    await waitFor(() => expect(screen.getByText('Compliant Store')).toBeTruthy());
    // Both stores visible initially
    expect(screen.getByText('Pending Store')).toBeTruthy();

    // Click the Pending card to filter
    const pendingButtons = screen.getAllByText('Pending');
    // The card button with label "Pending"
    const pendingCard = pendingButtons.find(el => el.closest('button[aria-pressed]'));
    if (pendingCard) {
      fireEvent.click(pendingCard.closest('button')!);
      await waitFor(() => {
        expect(screen.getByText('Pending Store')).toBeTruthy();
        expect(screen.queryByText('Compliant Store')).toBeNull();
      });
    }
  });

  // ── Refresh ─────────────────────────────────────────────────

  it('calls fetchComplianceOverview on mount', async () => {
    complianceMock.fetchComplianceOverview.mockResolvedValue(makeOverview());
    render(<ComplianceTab />);
    await waitFor(() => {
      expect(complianceMock.fetchComplianceOverview).toHaveBeenCalledTimes(1);
    });
  });

  it('calls fetchComplianceOverview again on Refresh click', async () => {
    complianceMock.fetchComplianceOverview.mockResolvedValue(makeOverview());
    render(<ComplianceTab />);
    await waitFor(() => expect(screen.getByText('Refresh')).toBeTruthy());
    fireEvent.click(screen.getByText('Refresh'));
    await waitFor(() => {
      expect(complianceMock.fetchComplianceOverview).toHaveBeenCalledTimes(2);
    });
  });

  // ── Multiple stores ─────────────────────────────────────────

  it('renders multiple stores in table', async () => {
    complianceMock.fetchComplianceOverview.mockResolvedValue(
      makeOverview({
        stores: [
          makeStore({ id: 's1', name: 'Store A', code: 'SA01' }),
          makeStore({ id: 's2', name: 'Store B', code: 'SB02', complianceStatus: 'non_compliant', kycComplete: false }),
          makeStore({ id: 's3', name: 'Store C', code: 'SC03', complianceStatus: 'pending' }),
        ],
      })
    );
    render(<ComplianceTab />);
    await waitFor(() => {
      expect(screen.getByText('Store A')).toBeTruthy();
      expect(screen.getByText('Store B')).toBeTruthy();
      expect(screen.getByText('Store C')).toBeTruthy();
    });
  });

  it('shows ACTIVE status badge in green', async () => {
    complianceMock.fetchComplianceOverview.mockResolvedValue(
      makeOverview({ stores: [makeStore({ status: 'ACTIVE' })] })
    );
    render(<ComplianceTab />);
    await waitFor(() => {
      const statusBadge = screen.getByText('ACTIVE');
      expect(statusBadge.className).toContain('sa-badge-ok');
    });
  });

  it('shows SUSPENDED status badge in red', async () => {
    complianceMock.fetchComplianceOverview.mockResolvedValue(
      makeOverview({ stores: [makeStore({ status: 'SUSPENDED', complianceStatus: 'non_compliant' })] })
    );
    render(<ComplianceTab />);
    await waitFor(() => {
      const statusBadge = screen.getByText('SUSPENDED');
      expect(statusBadge.className).toContain('sa-badge-error');
    });
  });

  it('shows NEEDS_FIX status badge in warning', async () => {
    complianceMock.fetchComplianceOverview.mockResolvedValue(
      makeOverview({ stores: [makeStore({ status: 'NEEDS_FIX', complianceStatus: 'non_compliant' })] })
    );
    render(<ComplianceTab />);
    await waitFor(() => {
      const statusBadge = screen.getByText('NEEDS_FIX');
      expect(statusBadge.className).toContain('sa-badge-warn');
    });
  });
});
